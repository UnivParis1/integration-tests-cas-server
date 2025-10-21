const cas = require('./cas');
const conf = require('./conf');
const { navigate, navigate_until_service } = require('./ua');
const { popen } = require('./helpers');

test.concurrent('API logout', async () => {
    const service = conf.test_services.no_attrs
    let ua = {}
    const { tgc } = await cas.get_tgc_and_ticket_using_form_post(service, conf.user, { ua })

    let response = await navigate(navigate_until_service(ua, service), cas.login_url(service))
    expect(response.status).toBe(302)

    const resp = await conf.api.run_curl_cmd(`curl -sS -XDELETE '${conf.api.cas_direct_url}/actuator/ssoSessions/users/${conf.user.login}'`)
    expect(resp).toContain(tgc)
    
    response = await navigate(navigate_until_service(ua, service), cas.login_url(service))
    expect(response.status).toBe(200)
})

