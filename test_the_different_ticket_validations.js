const cas = require('./cas');
const conf = require('./conf');

async function tests(get_ticket) {
    await Promise.all([ 
        async () => {
            const xml = await cas.get_ticket_and_validate(get_ticket, cas.p2_serviceValidate, conf.test_services.p2, conf.user)
            expect(xml).toContain(`<cas:user>${conf.user.login}</cas:user>`)
            //expect(xml).not.toContain('<cas:uid>') // `p2 serviceValidate should not include attrs`
        },
        async () => {
            const xml = await cas.get_ticket_and_validate(get_ticket, cas.p3_serviceValidate, conf.test_services.p3, conf.user)
            expect(xml).toContain(`<cas:user>${conf.user.login}</cas:user>`)
            expect(xml).toContain(`<cas:uid>${conf.user.login}</cas:uid>`)
            expect(xml).toContain(`<cas:mail>${conf.user.mail}</cas:mail>`)
        },
        async () => {
            const xml = await cas.get_ticket_and_validate(get_ticket, cas.samlValidate, conf.test_services.samlValidate, conf.user)
            expect(xml).toContain(`<saml1:Attribute AttributeName="uid" AttributeNamespace="http://www.ja-sig.org/products/cas/"><saml1:AttributeValue>${conf.user.login}</saml1:AttributeValue></saml1:Attribute>`)
            expect(xml).toContain(`<saml1:Attribute AttributeName="mail" AttributeNamespace="http://www.ja-sig.org/products/cas/"><saml1:AttributeValue>${conf.user.mail}</saml1:AttributeValue></saml1:Attribute>`)
        },
    ].map(f => f()))
}

module.exports = { tests }