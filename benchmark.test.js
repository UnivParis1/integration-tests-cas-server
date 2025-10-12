const cas = require('./cas');
const conf = require('./conf');

const one_to_n = (n) => Array.from({ length: n }).map((_, i) => 1+i)

const one = async (nb_tickets) => {
    const service = conf.test_services.p2
    const resp = await cas.login_form_post(service, conf.user, {})
    expect(resp.location).toBeTruthy()

    const tgc = resp.cookies?.[cas.tgc_name()]
    if (!tgc) throw "no tgc"
    console.log('tgc', tgc)
    for (const i of one_to_n(nb_tickets)) {
        const ticket = await cas.get_ticket_using_TGT(service, tgc)
        const xml = await cas.serviceValidate(service, ticket)
        expect(xml).toContain(`<cas:user>${conf.user.login}</cas:user>`)
    }
}

it("one", async () => {
    let { nb_requests, concurrency, nb_tickets } = process.env
    concurrency ||= 1
    for (const i of one_to_n(nb_requests / concurrency)) {
        console.log(i)
        await Promise.all(one_to_n(concurrency).map(_ => one(nb_tickets || 0)))
    }
}, 9999999)
