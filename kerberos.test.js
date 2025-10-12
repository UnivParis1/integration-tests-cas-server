const test_the_different_ticket_validations = require('./test_the_different_ticket_validations');
const cas = require('./cas');
const conf = require('./conf');
const fs = require('fs')

beforeAll(cas.kinit)

test.concurrent('no attrs serviceValidate with kerberos', () => test_the_different_ticket_validations.no_attrs(cas.get_ticket_using_kerberos))
test.concurrent('p3/serviceValidate with kerberos', () => test_the_different_ticket_validations.with_attrs(cas.get_ticket_using_kerberos))
if (conf.features.includes('samlValidate'))
test.concurrent('samlValidate with kerberos', () => test_the_different_ticket_validations.samlValidate(cas.get_ticket_using_kerberos))

test.concurrent('no_kerberos_for_userAgents', async () => {
    const headers_and_html = await cas.login_using_kerberos(conf.test_services.no_attrs, 'Kerberos', false)
    expect(headers_and_html).toMatch(new RegExp('^HTTP/.* 401 '))
    expect(headers_and_html).toMatch(new RegExp(/^www-authenticate: Negotiate/im))

    const no_krb_userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/106.0.0.0 Safari/537.36"
    const headers_and_html_ = await cas.login_using_kerberos(conf.test_services.no_attrs, no_krb_userAgent, false)
    expect(headers_and_html_).not.toMatch(new RegExp(/^www-authenticate: Negotiate/im))
})

afterAll(() => fs.unlinkSync(process.env.KRB5CCNAME))