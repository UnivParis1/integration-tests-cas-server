const cheerio = require('cheerio');
const conf = require('./conf');
const undici = require('undici')
const { throw_ } = require('./helpers')
const cas = require('./cas')

const verbose = false

const fc_users = {
    exact_match: 'sans_nom_dusage',
    same_birthday: 'test',
    birthday_different: 'avec_nom_dusage',
}

const toArray = (e) => (
    typeof e === 'string' ? [e] : e
)

function $first(resp, selector) {
    const elt = resp.$(selector).first()
    if (elt.length === 0) throw `expected ${selector} in html ${resp.body}`
    return elt
}

const cookiesToString = (map) => (
    map ? Object.entries(map).map(name_value => name_value.join('=')).join('; ') : ''
)

const new_navigate_until_service = (service) => (
    { noFollowIf: resp => resp.headers.location.startsWith(service) }    
)

function add_cookie_on_prev_url(ua, name, value) {
    ua.cookieJar[ua.prevUrl.origin][name] = value
}

// NB: undici.request allow things "fetch" can't do: set mode "navigate" which is checked by FC

async function navigate(ua, url, params) {
    url = new URL(url, ua.prevUrl)

    // may add cookies collected from previous navigation
    params ??= {}
    params.headers ??= {}
    params.headers.cookie ??= cookiesToString(ua.cookieJar?.[url.origin])
    if (verbose) console.log(`${url.href}
  using cookies: ${params.headers.cookie}
  and body ${params.body}`)

    // call the url
    const resp = await undici.request(url, params)
    const location = resp.headers.location

    // store prevUrl & cookies in ua
    ua.prevUrl = url
    if (resp.headers['set-cookie']) {
        ua.cookieJar ??= {}
        ua.cookieJar[url.origin] ??= {}
        for (const cookie of toArray(resp.headers['set-cookie'])) {
            const [, name, value] = cookie.match(/([^;=]*)=([^; ]*)/)
            if (cookie.match(/expires=Thu, 01 Jan 1970 00:00:00 GMT/)) {
                delete ua.cookieJar[url.origin][name]
            } else {
                ua.cookieJar[url.origin][name] = value
            }
        }
        if (verbose) console.log(resp.headers['set-cookie'])
        if (verbose) console.log(`${url.origin} cookies: ${JSON.stringify(ua.cookieJar[url.origin])}`)
    }

    if (resp.statusCode === 302) {
        if (!ua.noFollowIf?.(resp)) {
            // transparent redirect
            return await navigate(ua, location ?? throw_("no redirect to follow"))
        }
    } else if (resp.statusCode !== 200) {
        throw `expected HTTP 200, got HTTP ${resp.statusCode} for url ${url.href}`
    }
    const body = await resp.body.text()
    const $ = resp.headers['content-type']?.startsWith('text/html') ? cheerio.load(body) : undefined
    return { location, body, $ }
}

async function form_post(ua, $) {
    return await navigate(ua, $("form").attr('action'), { method: 'POST', headers: {
		'Content-type': 'application/x-www-form-urlencoded',
        'Accept': 'text/html',
	}, body: $("form").serialize() })
}

async function login_using_fc(ua, service, fc_user) {
    const cas_url = `${conf.cas_base_url}/login?service=${encodeURIComponent(service)}`

    const cas_login = await navigate(ua, cas_url)
    expect(cas_login.location).toBeFalsy()
    const fc_button_or_a = cas_login.$('#FranceConnect') // <a href> in 6.5, <button redirectUrl> in 6.6
    const to_fc_url = (fc_button_or_a.attr('redirecturl') || fc_button_or_a.attr('href')) ?? throw_("expected #FranceConnect in " + cas_login.body)
    const fc_wayf = await navigate(ua, to_fc_url)
    expect(fc_wayf.body).toContain(`Je choisis un compte pour me connecter sur`)

    // add cookie added in JS
    add_cookie_on_prev_url(ua, 'fiName', '%7B%22name%22%3A%22identity-provider-example-faible%22%2C%22remember%22%3Afalse%7D')
    const idp_interaction = await navigate(ua, '/call?provider=identity-provider-example-faible&storeFI=1')
    $first(idp_interaction, '[name=login]').val(fc_user)
    $first(idp_interaction, '[name=password]').val('123')
    const fc_authorize = await form_post(ua, idp_interaction.$)

    return await form_post(ua, fc_authorize.$)
}

async function login_using_fc_and_ldap(ua, service, fc_user) {
    const interrupt = await login_using_fc(ua, service, fc_user)
    expect(interrupt.body).toContain(`var autoRedirect = true;`)
    expect(interrupt.body).toContain(`var emptyLinks = false;`)
    expect(interrupt.body).toContain(`var redirectTimeout = -1;`)
    const js_redirect = JSON.parse(interrupt.body.match(/var link = (".*?")/)?.[1] ?? throw_("expected redirect link"))

    const cas_login_ldap = await navigate(ua, js_redirect)
    cas_login_ldap.$("#username").val(conf.user_for_fc.login);
    cas_login_ldap.$("#password").val(conf.user_for_fc.password);

    return await form_post(ua, cas_login_ldap.$)
}

async function check_ticket_validation(service, location, lastLoginIsFranceConnect) {
    expect(location).toContain(`ticket=`)
    const ticket = cas.get_ticket_from_location(location)
    const xml = await cas.p3_serviceValidate(service, ticket)
    expect(xml).toContain(`<cas:uid>pldupont</cas:uid>`)
    expect(xml).toContain(`<cas:givenName>Paul Louis</cas:givenName>`)
    expect(xml).toContain(`<cas:sn>Dupont</cas:sn>`)
    if (lastLoginIsFranceConnect) {
        expect(xml).toContain(`<cas:clientName>FranceConnect</cas:clientName>`)
    } else {
        expect(xml).not.toContain(`<cas:clientName>FranceConnect</cas:clientName>`)
    }
}

test.concurrent('FranceConnect login => no exact match => LDAP login => different birthday error', async () => {
    const service = conf.test_services.p3
    let ua = new_navigate_until_service(service)
    const resp = await login_using_fc_and_ldap(ua, service, fc_users.birthday_different)
    expect(resp.body).toContain(`Nom de famille et date de naissance provenant de France Connect ne correspondent pas à l'utilisateur`)
})

test.concurrent('FranceConnect login => no exact match => LDAP login => ajout supannFCSub', async () => {
    await cas.login_form_post('http://localhost/integration-tests-cas-server/cleanup', conf.user)
    
    const service = conf.test_services.p3
    let ua = new_navigate_until_service(service)
    const resp = await login_using_fc_and_ldap(ua, service, fc_users.same_birthday)
    await check_ticket_validation(service, resp.location, false)

    // On ré-essaye maintenant que le compte a un supannFCSub. On n'a plus besoin de se logger sur LDAP
    ua = new_navigate_until_service(service)
    const resp2 = await login_using_fc(ua, service, fc_users.same_birthday)
    await check_ticket_validation(service, resp2.location, true)
})

test.concurrent('FranceConnect login => exact match => ajout supannFCSub + logout', async () => {
    await cas.login_form_post('http://localhost/integration-tests-cas-server/cleanup', conf.user)

    const service = conf.test_services.p3
    
    let ua = new_navigate_until_service(service)
    const resp = await login_using_fc(ua, service, fc_users.exact_match)
    // => l'entrée LDAP a maintenant un supannFCSub
    await check_ticket_validation(service, resp.location, true)
   
    // On ré-essaye maintenant que le compte a un supannFCSub. Le résultat est le même, sauf qu'il n'y a pas eu besoin de "onlyFranceConnectSub" de interrupt.groovy
    ua = new_navigate_until_service(service)
    const resp2 = await login_using_fc(ua, service, fc_users.exact_match)
    await check_ticket_validation(service, resp2.location, true)

    // Avec le même ua, on teste maintenant le logout
    const cas_logout_url = `${conf.cas_base_url}/logout?service=${encodeURIComponent(conf.test_services.p2)}`
    const idp_logout = await navigate(ua, cas_logout_url)
    // FranceConnect FORM-POST redirect
    expect(idp_logout.body).toContain("op.logoutForm")
    idp_logout.$("form").append("<input name='logout' value='yes'>") // fait en Javascript...
    await form_post(ua, idp_logout.$)

    expect(""+ua.prevUrl).toBe("https://idp-test.univ-paris1.fr/idp/profile/Logout?state=terminateState")

    // Avec le même ua, on teste le relog qui doit nécessiter d'entrer le mot de passe FranceConnect à nouveau
    const resp3 = await login_using_fc(ua, service, fc_users.exact_match)
    await check_ticket_validation(service, resp3.location, true)
}, 10/*seconds*/ * 1000)
