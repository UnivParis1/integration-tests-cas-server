const cas = require('./cas');
const conf = require('./conf');

async function p2(get_ticket) {
    const xml = await cas.get_ticket_and_validate(get_ticket, cas.p2_serviceValidate, conf.test_services.p2, conf.user)
    expect(xml).toContain(`<cas:user>${conf.user.login}</cas:user>`)
    expect(xml).not.toContain('<cas:uid>') // `p2 serviceValidate should not include attrs`
}
async function p3(get_ticket) {
    const xml = await cas.get_ticket_and_validate(get_ticket, cas.p3_serviceValidate, conf.test_services.p3, conf.user)
    expect(xml).toContain(`<cas:user>${conf.user.login}</cas:user>`)
    expect(xml).toContain(`<cas:uid>${conf.user.login}</cas:uid>`)
    expect(xml).toContain(`<cas:mail>${conf.user.mail}</cas:mail>`)
}
async function samlValidate(get_ticket) {
    let xml = await cas.get_ticket_and_validate(get_ticket, cas.samlValidate, conf.test_services.samlValidate, conf.user)
    
    // minimal formatting to ease reading: 
    xml = xml.replaceAll(/(<saml1?:Attribute |<saml1?:Subject>)/g, "\n$1")

    expect(xml).toMatch(new RegExp(`<saml1?:Attribute AttributeName="uid" AttributeNamespace="http://www.ja-sig.org/products/cas/"><saml1?:AttributeValue[^>]*>${conf.user.login}</saml1?:AttributeValue></saml1?:Attribute>`))
    expect(xml).toMatch(new RegExp(`<saml1?:Attribute AttributeName="mail" AttributeNamespace="http://www.ja-sig.org/products/cas/"><saml1?:AttributeValue[^>]*>${conf.user.mail}</saml1?:AttributeValue></saml1?:Attribute>`))
}

module.exports = { p2, p3, samlValidate }