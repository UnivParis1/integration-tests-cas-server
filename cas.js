const cheerio = require('cheerio');
const helpers = require('./helpers');
const backChannelServer = require('./backChannelServer');
const conf = require('./conf');
const { throw_ } = require('./helpers')


const get_ticket_from_location = (location) => (
    location.match(/[?&]ticket=([^&]*)$/)?.[1] ?? throw_("expected ticket in location " + location)
)

async function get_ticket_from_response_location(response) {
    if (response.status !== 302) {
        if (response.status === 200 || response.status === 401) {
            throw "expected redirect to service with a ticket (it means login failed)"
        } else {
            throw `expected HTTP 302, got HTTP ${response.status}`
        }
    }
    const location = response.headers.get('location') ?? throw_("expected header location")
    return get_ticket_from_location(location)
}

async function login_form_post(service, user, rememberMe) {
    const url = `${conf.cas_base_url}/login?service=${encodeURIComponent(service)}`
    const response = await fetch(url)
    const html = await response.text()
    const $ = cheerio.load(html);
    $("#username").val(user.login);
    $("#password").val(user.password);
    if (rememberMe) $("#rememberMe").prop('checked', true)
    return await fetch(url, { method: 'POST', redirect: 'manual', headers: {
		'Content-type': 'application/x-www-form-urlencoded',
        'Accept': 'text/html',
	}, body: $("form").serialize() })
}

async function get_tgc_and_ticket_using_form_post(service, user, rememberMe) {
    const response = await login_form_post(service, user, rememberMe)
    const tgc = response.headers.get('set-cookie')?.match(/TGC=([^;]*)/)?.[1]
    const ticket = await get_ticket_from_response_location(response)
    return { tgc, ticket }
}

async function get_ticket_using_form_post(service, user) {
    return (await get_tgc_and_ticket_using_form_post(service, user)).ticket
}

async function get_ticket_using_TGT(service, tgc) {
    const response = await fetch(`${conf.cas_base_url}/login?service=${encodeURIComponent(service)}`, {
        headers: { Cookie: `TGC=${tgc}` },
        redirect: 'manual',
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
    return await (await fetch(url)).text()
}
const p2_serviceValidate = (service, ticket) => _serviceValidate(service, ticket, {})
const p3_serviceValidate = (service, ticket) => _serviceValidate(service, ticket, { p3: true })

async function samlValidate(service, ticket) {
    const url = `${conf.cas_base_url}/samlValidate?TARGET=${encodeURIComponent(service)}`
    return await (await fetch(url, {
        method: 'POST',
        body: helpers.samlRequest(ticket),
    })).text()
}

async function get_ticket_and_validate(get_ticket, validate, service, user) {
    const ticket = await get_ticket(service, user)
    return await validate(service, ticket)
}

async function get_pgt(service, user) {
    const ticket = await get_ticket_using_form_post(service, user)
    const xml = await _serviceValidate(service, ticket, { pgtUrl: `${conf.backChannelServer.frontalUrl}//pgtCallback` })
    const pgtIou = xml.match(/<cas:proxyGrantingTicket>([^<]*)/)?.[1] ?? throw_("missing <cas:proxyGrantingTicket> in " + xml)
    return helpers.get_delete(backChannelServer.state.pgtIou_to_pgt, pgtIou) ?? throw_("unknown pgtIou " + pgtIou)
}

module.exports = { 
    get_ticket_from_location,
    login_form_post, get_ticket_using_form_post,
    kinit, login_using_kerberos, get_ticket_using_kerberos, 
    get_tgc_and_ticket_using_form_post,
    get_ticket_using_TGT,

    p2_serviceValidate, p3_serviceValidate, samlValidate, 

    get_pgt,
    get_ticket_and_validate,
}