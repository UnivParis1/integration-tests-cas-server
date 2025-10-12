const assert = require('assert')
const helpers = require('./helpers');
const cas = require('./cas');
const conf = require('./conf');

const test_without_jest = (name, cb) => cb()

test_without_jest('tgt_lifetime', async () => {
    const try_after = async (rememberMe, delay, how_many_times) => {
        const { tgc } = await cas.get_tgc_and_ticket_using_form_post(conf.test_services.p2, conf.user, { rememberMe })
        for (let i = 0; i < how_many_times; i++) {
            await helpers.waitHours(delay)
            console.log('test_tgt_lifetime with tgc', tgc, 'and rememberMe', rememberMe, 'round #' + i, ': delay', delay, 'hours', how_many_times)
            const ticket = await cas.get_ticket_using_TGT(conf.test_services.p2, tgc)
            const xml = await cas.serviceValidate(conf.test_services.p2, ticket)
            console.log('test_tgt_lifetime with tgc', tgc, 'got ticket', ticket, xml)
            assert.match(xml, new RegExp(`<cas:user>${conf.user.login}</cas:user>`))
        }
    }
    return await Promise.all([ 
        async () => {
            await assert.doesNotReject(try_after(false, 4 /*hours*/, 6 *  4 /*days*/), 'TGT should not expire if used often')
        },
        async () => {
            await assert.rejects(try_after(false, 10 /*hours*/, 1), 'TGT expired if unused after 10h')
        },
        async () => {
            await assert.doesNotReject(try_after(true, 10 /*hours*/, 1), 'rememberMe TGT should not expire after 10h')
        },
        async () => {
            await assert.doesNotReject(try_after(true, 20 /*days*/ * 24, 2), 'rememberMe TGT should not expire if used every 20d')
        },
        async () => {
            await assert.rejects(try_after(true, 31 /*days*/ * 24, 1), 'TGT rememberMe expired if unused after 31d')
        },
    ].map(f => f()))
})
