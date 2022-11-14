const test_the_different_ticket_validations = require('./test_the_different_ticket_validations');
const cas = require('./cas');
const conf = require('./conf');
const fs = require('fs')

beforeAll(cas.kinit)

test.concurrent('no attrs serviceValidate with kerberos', () => test_the_different_ticket_validations.p2(cas.get_ticket_using_kerberos))
test.concurrent('p3/serviceValidate with kerberos', () => test_the_different_ticket_validations.p3(cas.get_ticket_using_kerberos))
if (conf.features.includes('samlValidate'))
test.concurrent('samlValidate with kerberos', () => test_the_different_ticket_validations.samlValidate(cas.get_ticket_using_kerberos))

test.concurrent('no_kerberos_for_userAgents', async () => {
    const headers_and_html = await cas.login_using_kerberos(conf.test_services.p2, "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/106.0.0.0 Safari/537.36")
    expect(headers_and_html).toMatch(new RegExp('^HTTP/.* 200 '))
    if (conf.flavor === 'lemonldap') {
        expect(headers_and_html).toContain('passwordfield')
    } else {
        expect(headers_and_html).toContain('<span>Connexion Paris 1</span>')
        expect(headers_and_html).toContain('<span>Connexion via FranceConnect : </span>')
    }
})

afterAll(() => fs.unlinkSync(process.env.KRB5CCNAME))