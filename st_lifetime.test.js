const helpers = require('./helpers');
const cas = require('./cas');
const conf = require('./conf');

test('st_lifetime', async () => {
    const validate_after = async (delay) => {
        const ticket = await cas.get_ticket_using_form_post(conf.test_services.no_attrs, conf.user)
        //console.log('test_st_lifetime: got ticket', ticket, '. waiting', delay, 'to validate it')
        await helpers.waitSeconds(delay)
        //console.log('test_st_lifetime: validating ticket', ticket)
        return await cas.serviceValidate(conf.test_services.no_attrs, ticket)
    }
    const timeToLive = 10 /*seconds*/ // cas.ticket.ServiceTicket.timeToLive
    return await Promise.all([ 
        async () => {
            expect(await validate_after((timeToLive - 3) /*seconds*/)).toContain(`<cas:user>${conf.user.login}</cas:user>`)
        },
        async () => {
            expect(await validate_after((timeToLive + 1) /*seconds*/)).toContain(`code="INVALID_TICKET"`)
        },
    ].map(f => f()))
}, 20/*seconds*/ * 1000)
