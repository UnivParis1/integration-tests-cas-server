const helpers = require('./helpers');
const cas = require('./cas');
const conf = require('./conf');

// can NOT be done in parallel with other tests!!
test('throttle', async () => {
    const invalid_login = async (password) => {
        return await cas.login_form_post(conf.test_services.p2, { login: 'test_throttle', password }, false)
    }
    expect((await invalid_login('first')).status).toBe(401)
    await helpers.waitSeconds(2)

    let response = await invalid_login('second')
    expect(response.status).toBe(423)
    const html = await response.text()
    expect(html).toContain(`You've been throttled`) // Vous avez saisi un mauvais mot de passe trop de fois de suite. Vous avez été rejeté

    //console.log("waiting to be allowed again")
    await helpers.waitSeconds(3)
    const xml = await cas.get_ticket_and_validate(cas.get_ticket_using_form_post, cas.p2_serviceValidate, conf.test_services.p2, conf.user)
    expect(xml).toContain(`<cas:user>${conf.user.login}</cas:user>`)
}, 10/*seconds*/ * 1000)

//for (const _ of Array.from({ length: 10 })) {
//    const login_prefix = Date.now() + "_"
//    const tests = Array.from({ length: 10 }, (_, i) => invalid_login(login_prefix + i))
//    for (const resp of await Promise.all(tests)) {
//        expect(resp.status).toBe(401)
//    }
//}
