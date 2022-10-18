const backChannelServer = require('./backChannelServer');
const test_the_different_ticket_validations = require('./test_the_different_ticket_validations');
const cas = require('./cas');
const conf = require('./conf');

test.concurrent('actuator_ip_protected', async () => {
    const response = await fetch(`${conf.cas_base_url}/actuator`)
    expect(response.status).toBe(403)
})

test.concurrent('login_page', async () => {
    const url = `${conf.cas_base_url}/login?service=${encodeURIComponent(conf.test_services.p2)}`
    const html = await (await fetch(url, { headers: { 'accept-language': 'fr' }})).text()
    expect(html).toContain('<span>Connexion Paris 1</span>')
    expect(html).toContain('<span>Connexion via FranceConnect : </span>')
})

test.concurrent('logout redirect', async () => {
    const url = `${conf.cas_base_url}/logout?service=${encodeURIComponent(conf.test_services.p2)}`
    const response = await fetch(url, { redirect: 'manual' })
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('https://idp-test.univ-paris1.fr/idp/profile/Logout')
})

test.concurrent('login_with_mail', async () => {
    const xml = await cas.get_ticket_and_validate(cas.get_ticket_using_form_post, cas.p2_serviceValidate, conf.test_services.p2, { ...conf.user, login: conf.user.mail})
    expect(xml).toContain(`<cas:user>${conf.user.login}</cas:user>`)
})

test.concurrent('logout removes TGC', async () => {
    const service = `${conf.backChannelServer.frontalUrl}/app1`
    const { tgc, ticket } = await cas.get_tgc_and_ticket_using_form_post(service, conf.user)
    const xml = await cas.p2_serviceValidate(service, ticket)
    expect(xml).toContain(`<cas:user>${conf.user.login}</cas:user>`)

    await fetch(`${conf.cas_base_url}/logout`, {
        headers: { Cookie: `TGC=${tgc}` },
        redirect: 'manual',
    })

    const response = await fetch(`${conf.cas_base_url}/login?service=${encodeURIComponent(service)}`, {
        headers: { Cookie: `TGC=${tgc}` },
        redirect: 'manual',
    })
    expect(response.status).toBe(200)
})

if (conf.features.includes('single_logout'))
test.concurrent('single_logout', async () => {
    const service = `${conf.backChannelServer.frontalUrl}/app1`
    const { tgc, ticket } = await cas.get_tgc_and_ticket_using_form_post(service, conf.user)
    const xml = await cas.p2_serviceValidate(service, ticket)
    expect(xml).toContain(`<cas:user>${conf.user.login}</cas:user>`)

    backChannelServer.start_if_not_running()
    await fetch(`${conf.cas_base_url}/logout`, {
        headers: { Cookie: `TGC=${tgc}` },
        redirect: 'manual',
    })
    const logoutRequest = await backChannelServer.expectSingleLogoutRequest(ticket, 1/*seconds*/ * 1000)
    expect(logoutRequest).toContain(`<saml:NameID xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion">${conf.user.login}</saml:NameID>`)
}, 2000)

test.concurrent('no attrs serviceValidate with FORM post', () => test_the_different_ticket_validations.p2(cas.get_ticket_using_form_post))
test.concurrent('p3/serviceValidate with FORM post', () => test_the_different_ticket_validations.p3(cas.get_ticket_using_form_post))
if (conf.features.includes('samlValidate'))
test.concurrent('samlValidate with FORM post', () => test_the_different_ticket_validations.samlValidate(cas.get_ticket_using_form_post))

async function test_proxy_ticket(service, targetService) {
    const pgt = await cas.get_pgt(service, conf.user)

    const xml = await (await fetch(`${conf.cas_base_url}/proxy?targetService=${encodeURIComponent(targetService)}&pgt=${pgt}`)).text()
    const pticket = xml.match(/<cas:proxyTicket>([^<]*)/)?.[1]
    if (!pticket) throw "missing proxyTicket in " + xml

    const xml_ = await (await fetch(`${conf.cas_base_url}/proxyValidate?service=${encodeURIComponent(targetService)}&ticket=${pticket}`)).text()
    expect(xml_).toContain(`<cas:proxy>${conf.backChannelServer.frontalUrl}//pgtCallback</cas:proxy>`)
    expect(xml_).toContain(`<cas:user>${conf.user.login}</cas:user>`)
    expect(xml_).not.toContain(`<cas:uid>${conf.user.login}</cas:uid>`)
    expect(xml_).not.toContain(`<cas:mail>${conf.user.mail}</cas:mail>`)
}

if (conf.features.includes('proxy'))
test.concurrent('proxy ticket', async () => {
    backChannelServer.start_if_not_running()
    await test_proxy_ticket(...conf.test_services.proxy)
})

afterAll(() => {
    backChannelServer.stop_if_running()
})
