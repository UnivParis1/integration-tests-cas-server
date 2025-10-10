const cheerio = require('cheerio');
const conf = require('./conf');
const undici = require('undici')
const { throw_ } = require('./helpers')
const { form_post, navigate, add_cookie_on_prev_url, $first, new_navigate_until_service } = require('./ua')
const cas = require('./cas')

const fc_users = {
    exact_match: 'sans_nom_dusage',
    same_birthday: 'test',
    birthday_different: 'avec_nom_dusage',
}

async function login_using_fc(ua, service, fc_user) {
    const cas_url = cas.login_url(service)

    let to_fc_url;
    if (conf.flavor === 'lemonldap') {
        to_fc_url = `${cas_url}&idp=FranceConnect`// (fc_button_or_a.attr('redirecturl') || fc_button_or_a.attr('href')) ?? throw_("expected #FranceConnect in " + cas_login.body)
    } else {
        const cas_login = await navigate(ua, cas_url)
        expect(cas_login.location).toBeFalsy()
        const fc_button_or_a = cas_login.$('#FranceConnect') // <a href> in 6.5, <button redirectUrl> in 6.6
        to_fc_url = (fc_button_or_a.attr('redirecturl') || fc_button_or_a.attr('href')) ?? throw_("expected #FranceConnect in " + cas_login.body)
    }
    const fc_wayf = await navigate(ua, to_fc_url)
    expect(fc_wayf.body).toContain(`Connexion - choix du compte`)

    // add cookie added in JS
    add_cookie_on_prev_url(ua, 'fiName', '%7B%22name%22%3A%22identity-provider-example-faible%22%2C%22remember%22%3Afalse%7D')
    const idp_interaction = await navigate(ua, '/call?provider=identity-provider-example-faible&storeFI=1')
    $first(idp_interaction, '[name=login]').val(fc_user)
    $first(idp_interaction, '[name=password]').val('123')
    const fc_authorize = await form_post(ua, idp_interaction.$)

    return await form_post(ua, fc_authorize.$)
}

async function login_using_fc_and_ldap_(ua, service, fc_user) {
    let cas_login_ldap = await login_using_fc(ua, service, fc_user)

    expect(cas_login_ldap.location).toBeFalsy()

    if (conf.flavor === 'apereo_cas') {
        // Apereo CAS JS FORM POST redirect
        const interrupt = cas_login_ldap;
        const let_or_var = interrupt.body.match(`let autoRedirect = `) ? 'let' : 'var'
        expect(interrupt.body).toContain(`${let_or_var} autoRedirect = true;`)
        expect(interrupt.body).toContain(`${let_or_var} emptyLinks = false;`)
        expect(interrupt.body).toContain(`${let_or_var} redirectTimeout = -1;`)
        const js_redirect = JSON.parse(interrupt.body.match(`${let_or_var} link = (".*?")`)?.[1] ?? throw_("expected redirect link"))
        cas_login_ldap = await navigate(ua, js_redirect)
    }
    return cas_login_ldap
}

async function login_using_fc_and_ldap(ua, service, fc_user) {
    const cas_login_ldap = await login_using_fc_and_ldap_(ua, service, fc_user)
    return await cas.login_form_post_(ua, cas_login_ldap, conf.user_for_fc, false)
}

async function forced_login_using_fc_and_ldap(ua, service, fc_user, ldap_user) {
    const cas_login_ldap = await login_using_fc_and_ldap_(ua, service, fc_user)

    expect(cas_login_ldap.body).toContain(`<p>Double authentification nécessaire pour la réinit de 2ème facteur</p>`)
    
    return await cas.login_form_post_(ua, cas_login_ldap, ldap_user || conf.user_for_fc, false)
}

async function check_p3_ticket_validation(service, location, lastLoginIsFranceConnect) {
    expect(location).toContain(`ticket=`)
    const ticket = cas.get_ticket_from_location(location)
    const xml = await cas.p3_serviceValidate(service, ticket)
    expect(xml).toContain(`<cas:user>pldupont</cas:user>`)
    expect(xml).toContain(`<cas:uid>pldupont</cas:uid>`)
    expect(xml).toContain(`<cas:givenName>Paul Louis</cas:givenName>`)
    expect(xml).toContain(`<cas:sn>Dupont</cas:sn>`)
    if (lastLoginIsFranceConnect) {
        expect(xml).toContain(`<cas:clientName>FranceConnect</cas:clientName>`)
        expect(xml).not.toContain(`<cas:first_clientName>FranceConnect</cas:first_clientName>`)
    } else {
        expect(xml).not.toContain(`<cas:clientName>FranceConnect</cas:clientName>`)
        expect(xml).toContain(`<cas:first_clientName>FranceConnect</cas:first_clientName>`)
    }
    return xml
}

async function check_no_attrs_ticket_validation(service, location, lastLoginIsFranceConnect, with_attrs) {
    expect(location).toContain(`ticket=`)
    const ticket = cas.get_ticket_from_location(location)
    const xml = await cas.p2_serviceValidate(service, ticket)
    expect(xml).toContain(`<cas:user>pldupont</cas:user>`)

    if (lastLoginIsFranceConnect) {
        expect(xml).toContain(`<cas:clientName>FranceConnect</cas:clientName>`)
    } else {
        expect(xml).not.toContain(`<cas:clientName>FranceConnect</cas:clientName>`)
    }
}

// simple test to ensure conf.user_for_fc is valid
test('login with user_for_fc', async () => {
    const xml = await cas.get_ticket_and_validate(cas.get_ticket_using_form_post, cas.p2_serviceValidate, conf.test_services.p2, conf.user_for_fc)
    expect(xml).toContain(`<cas:user>${conf.user_for_fc.login}</cas:user>`)
})

test('FranceConnect login => no exact match => LDAP login => different birthday error', async () => {
    await cas.login_form_post('http://localhost/integration-tests-cas-server/cleanup', conf.user)

    const service = conf.test_services.p3
    let ua = new_navigate_until_service(service)
    const resp = await login_using_fc_and_ldap(ua, service, fc_users.birthday_different)
    expect(resp.body).toContain(`date de naissance provenant de France Connect ne correspond pas à l'utilisateur`)
})

test('FranceConnect login => no exact match => LDAP login => ajout supannFCSub', async () => {
    await cas.login_form_post('http://localhost/integration-tests-cas-server/cleanup', conf.user)
    
    const service = conf.test_services.p3
    let ua = new_navigate_until_service(service)
    const resp = await login_using_fc_and_ldap(ua, service, fc_users.same_birthday)
    await check_p3_ticket_validation(service, resp.location, false)

    // On ré-essaye maintenant que le compte a un supannFCSub. On n'a plus besoin de se logger sur LDAP
    ua = new_navigate_until_service(service)
    const resp2 = await login_using_fc(ua, service, fc_users.same_birthday)
    await check_p3_ticket_validation(service, resp2.location, true)
})

test('FranceConnect login => exact match => ajout supannFCSub + logout', async () => {
    await cas.login_form_post('http://localhost/integration-tests-cas-server/cleanup', conf.user)

    const service = conf.test_services.p3
    
    let ua = new_navigate_until_service(service)
    const resp = await login_using_fc(ua, service, fc_users.exact_match)
    // => l'entrée LDAP a maintenant un supannFCSub
    await check_p3_ticket_validation(service, resp.location, true)
   
    // On ré-essaye maintenant que le compte a un supannFCSub. Le résultat est le même, sauf qu'il n'y a pas eu besoin de "onlyFranceConnectSub" de interrupt.groovy
    ua = new_navigate_until_service(service)
    const resp2 = await login_using_fc(ua, service, fc_users.exact_match)
    await check_p3_ticket_validation(service, resp2.location, true)

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
    await check_p3_ticket_validation(service, resp3.location, true)
}, 10/*seconds*/ * 1000)

test('need double auth: FranceConnect login => exact match => ajout supannFCSub', async () => {
    await cas.login_form_post('http://localhost/integration-tests-cas-server/cleanup', conf.user)

    const service = conf.test_services.FC_double_auth
    
    let ua = new_navigate_until_service(service)
    const resp = await forced_login_using_fc_and_ldap(ua, service, fc_users.exact_match)
    await check_p3_ticket_validation(service, resp.location, false)

    // On ré-essaye maintenant que le compte a un supannFCSub. Le résultat est le même
    ua = new_navigate_until_service(service)
    const resp2 = await forced_login_using_fc_and_ldap(ua, service, fc_users.exact_match)
    await check_p3_ticket_validation(service, resp2.location, false)
    
}, 10/*seconds*/ * 1000)

test('need double auth: FranceConnect login => exact match => mais utilisateur LDAP différent', async () => {
    await cas.login_form_post('http://localhost/integration-tests-cas-server/cleanup', conf.user)

    const service = conf.test_services.FC_double_auth
    
    // on met le supannFCSub
    let ua = new_navigate_until_service(service)
    const resp = await forced_login_using_fc_and_ldap(ua, service, fc_users.exact_match)

    // on test avec un utilisateur LDAP différent de celui ayant le supannFCSub
    ua = new_navigate_until_service(service)
    const resp2 = await forced_login_using_fc_and_ldap(ua, service, fc_users.exact_match, conf.user)
    
    expect(resp2.body).toContain(`<p id="interruptMessage">Comptes différents</p>`)
    
}, 10/*seconds*/ * 1000)

test('need double auth: FranceConnect login => no exact match => ajout supannFCSub', async () => {
    await cas.login_form_post('http://localhost/integration-tests-cas-server/cleanup', conf.user)

    const service = conf.test_services.FC_double_auth
    
    let ua = new_navigate_until_service(service)
    const resp = await forced_login_using_fc_and_ldap(ua, service, fc_users.same_birthday)
    await check_p3_ticket_validation(service, resp.location, false)

    // On ré-essaye maintenant que le compte a un supannFCSub. Le résultat est le même
    ua = new_navigate_until_service(service)
    const resp2 = await forced_login_using_fc_and_ldap(ua, service, fc_users.same_birthday)
    await check_p3_ticket_validation(service, resp2.location, false)
    
}, 10/*seconds*/ * 1000)

test('FranceConnect login => no attrs serviceValidate', async () => {
    await cas.login_form_post('http://localhost/integration-tests-cas-server/cleanup', conf.user)

    const service = conf.test_services.p2
    
    let ua = new_navigate_until_service(service)
    const resp = await login_using_fc(ua, service, fc_users.exact_match)
    // => l'entrée LDAP a maintenant un supannFCSub
    await check_no_attrs_ticket_validation(service, resp.location, true)
   
    // On ré-essaye maintenant que le compte a un supannFCSub. Le résultat est le même, sauf qu'il n'y a pas eu besoin de "onlyFranceConnectSub" de interrupt.groovy
    ua = new_navigate_until_service(service)
    const resp2 = await login_using_fc(ua, service, fc_users.exact_match)
    await check_no_attrs_ticket_validation(service, resp2.location, true)

    // On demande un autre ticket avec la session CAS ci-dessus, les attrs doivent être les même
    const resp3 = await navigate(ua, `${conf.cas_base_url}/login?service=${encodeURIComponent(service)}`)
    await check_no_attrs_ticket_validation(service, resp3.location, true)
})
