const helpers = require('../lib/helpers');
const cas = require('../lib/cas');
const conf = require('../conf');

// can NOT be done in parallel with other tests!!
test('throttle', async () => {
    const invalid_login = async (password) => {
        try {
            return await cas.login_form_post(conf.test_services.no_attrs, { login: conf.user.login, password }, { ua: { alwaysHeaders: { 
                // test with "Kerberos" user-agent which triggers a bug in Apereo CAS 7.1
                'User-Agent': 'Kerberos',
            } } })
        } catch (e) {
            return e
        }
    }
    let err = await invalid_login('first')
    expect(err.error).toBeUndefined()
    expect(err.status).toBe(401)
    //expect(err.body).toContain(`likely due to invalid credentials`)
    expect(err.body).toContain(`Mauvais identifiant / mot de passe.`)
    await helpers.waitSeconds(1)

    err = await invalid_login('second')
    expect(err.status).toBe(423)
    //expect(err.body).toContain(`You've entered the wrong password for the user too many times. You've been throttled`) // You've been throttled
    expect(err.body).toContain(`Vous avez saisi un mauvais mot de passe trop de fois de suite. Vous avez été rejeté.`) // You've been throttled

    // même avec le bon mot de passe, on a tjs une erreur :
    err = await invalid_login(conf.user.password)
    expect(err.status).toBe(423)
    //expect(err.body).toContain(`You've entered the wrong password for the user too many times. You've been throttled`) // You've been throttled
    expect(err.body).toContain(`Vous avez saisi un mauvais mot de passe trop de fois de suite. Vous avez été rejeté.`) // You've been throttled

    //console.log("waiting to be allowed again")
    await helpers.waitSeconds(3)
    const xml = await cas.get_ticket_and_validate(cas.get_ticket_using_form_post, cas.serviceValidate, conf.test_services.no_attrs, conf.user)
    expect(xml).toContain(`<cas:user>${conf.user.login}</cas:user>`)
}, 10/*seconds*/ * 1000)

//for (const _ of Array.from({ length: 10 })) {
//    const login_prefix = Date.now() + "_"
//    const tests = Array.from({ length: 10 }, (_, i) => invalid_login(login_prefix + i))
//    for (const resp of await Promise.all(tests)) {
//        expect(resp.status).toBe(401)
//    }
//}
