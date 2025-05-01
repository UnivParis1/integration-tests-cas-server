const crypto = require("crypto")
const helpers = require('./helpers');
const backChannelServer = require('./backChannelServer');
const conf = require('./conf');
const { throw_ } = require('./helpers')
const { navigate, new_navigate_until_service, form_post } = require('./ua')

const flavor_to_tgc_name = {
    apereo_cas: 'TGC',
    lemonldap: 'lemonldap',
    shibboleth: 'shib_idp_session',
    keycloak: 'KEYCLOAK_IDENTITY',
}

const tgc_name = () => (
    conf.tgc_name || flavor_to_tgc_name[conf.flavor] || throw_("unknown tgc_name")
)

const get_ticket_from_location = (location) => (
    location.match(/[?&]ticket=([^&]*)$/)?.[1] ?? throw_("expected ticket in location " + location)
)

async function get_ticket_from_response_location(response) {
    const location = response.location ?? throw_("expected header location")
    return get_ticket_from_location(location)
}

async function login_form_post_(ua, response, user, rememberMe) {
    let $ = response.$

    if (conf.flavor === 'lemonldap') {
        if (response.body.includes('/kerberos.js')) {
            // lemonldap has an intermediate form to handle optional Kerberos
            $ = (await form_post(ua, $)).$
        }
        $("[name=user]").val(user.login);
        $("[name=password]").val(user.password);
        if (rememberMe) {
            $("[name=stayconnected]").prop('checked', true)
            // lemonldap has an intermediate form which computes a fingerprint (... computed but ignored with option "stayConnectedBypassFG")
            $ = (await form_post(ua, $)).$
            $("#fg").val(crypto.randomBytes(20).toString('hex'))
        }
    } else {
        $("#username").val(user.login);
        $("#password").val(user.password);
        if (conf.flavor === 'shibboleth') {
            $("form").append("<input name='_eventId_proceed' value=''>") // should be done by cheerio?
        }
        if (rememberMe) $("#rememberMe").prop('checked', true)
    }
    return await form_post(ua, $)
}

async function login_form_post(service, user, rememberMe) {
    const ua = new_navigate_until_service(service)
    const url = `${conf.cas_base_url}/login?service=${encodeURIComponent(service)}`
    const response = await navigate(ua, url)
    return await login_form_post_(ua, response, user, rememberMe)
}

async function get_tgc_and_ticket_using_form_post(service, user, rememberMe) {
    const response = await login_form_post(service, user, rememberMe)
    const tgc = response.cookies?.[tgc_name()]
    const ticket = await get_ticket_from_response_location(response)
    return { tgc, ticket }
}

async function get_ticket_using_form_post(service, user) {
    return (await get_tgc_and_ticket_using_form_post(service, user)).ticket
}

async function get_ticket_using_TGT(service, tgc) {
    const response = await navigate(new_navigate_until_service(service), `${conf.cas_base_url}/login?service=${encodeURIComponent(service)}`, {
        headers: { cookie: `${tgc_name()}=${tgc}` },
    })
    return await get_ticket_from_response_location(response)
}

async function kinit() {
    const user = conf.user
    if (!process.env.KRB5CCNAME) throw "you must env var KRB5CCNAME when calling jest"
    await helpers.popen(user.password, 'kinit', [
        ...conf.kerberos.flavor === 'Heimdal' ? ['--password-file=STDIN'] : [],
        user.login + '@' + conf.kerberos.realm,
    ])
}

async function login_using_kerberos(service, userAgent) {
    if (!process.env.KRB5CCNAME) throw "call kinit() first"
    const url = `${conf.cas_base_url}/login?service=${encodeURIComponent(service)}`
    return await helpers.popen('', 'curl', [
        '-si', 
        '-H', `User-Agent: ${userAgent}`,
        '--negotiate', '-u', ':', 
        url,
    ])
}
async function get_ticket_using_kerberos(service, _user) {
    const headers_and_html = await login_using_kerberos(service, 'Kerberos')
    return headers_and_html.match(/^Location: .*[&?]ticket=([^&\s]*)$/mi)?.[1]
}

async function _serviceValidate(service, ticket, opts) {
    let url = `${conf.cas_base_url}${opts?.p3 ? '/p3' : ''}/serviceValidate?service=${encodeURIComponent(service)}&ticket=${ticket}`
    if (opts.pgtUrl) url += '&pgtUrl=' + encodeURIComponent(opts.pgtUrl)
    return (await navigate({}, url)).body
}
const p2_serviceValidate = (service, ticket) => _serviceValidate(service, ticket, {})
const p3_serviceValidate = (service, ticket) => _serviceValidate(service, ticket, { p3: true })

async function samlValidate(service, ticket) {
    const url = `${conf.cas_base_url}/samlValidate?TARGET=${encodeURIComponent(service)}`
    return (await navigate({}, url, {
        method: 'POST',
        headers: { 
            'soapaction': 'http://www.oasis-open.org/committees/security', // required by KEYCLOAK
            'Content-type': 'text/xml',
        },
        body: helpers.samlRequest(ticket),
    })).body
}

async function get_ticket_and_validate(get_ticket, validate, service, user) {
    const ticket = await get_ticket(service, user)
    if (!ticket) throw "missing ticket"
    return await validate(service, ticket)
}

async function get_pgt(service, user) {
    const ticket = await get_ticket_using_form_post(service, user)
    const xml = await _serviceValidate(service, ticket, { pgtUrl: `${conf.backChannelServer.frontalUrl}//pgtCallback` })
    const pgtIou = xml.match(/<cas:proxyGrantingTicket>([^<]*)/)?.[1] ?? throw_("missing <cas:proxyGrantingTicket> in " + xml)
    return helpers.get_delete(backChannelServer.state.pgtIou_to_pgt, pgtIou) ?? throw_("unknown pgtIou " + pgtIou)
}

module.exports = { 
    tgc_name, get_ticket_from_location,
    login_form_post_, login_form_post, get_ticket_using_form_post,
    kinit, login_using_kerberos, get_ticket_using_kerberos, 
    get_tgc_and_ticket_using_form_post,
    get_ticket_using_TGT,

    p2_serviceValidate, p3_serviceValidate, samlValidate, 

    get_pgt,
    get_ticket_and_validate,
}