const express = require('express');
const bodyParser = require('body-parser')
const conf = require('./conf');


let state = {
    server: undefined,
    pgtIou_to_pgt: {},
    singleLogoutRequest_to_resolve: {},
}

function start_if_not_running() {
    if (state.server) return
    const app = express()

    app.get('/pgtCallback', (req, res) => {
        const { pgtIou, pgtId } = req.query
        if (pgtIou) state.pgtIou_to_pgt[pgtIou] = pgtId
        //console.log(pgtIou_to_pgt)
        res.send('')
    });
    app.post('/app1', bodyParser.urlencoded({ extended: false }), (req, res) => { 
        const ticket = req.body?.logoutRequest?.match(/<samlp:SessionIndex>([^<]*)/)?.[1]
        if (!ticket) {
            console.error("expected single logoutRequest, got", req.body)
        } else {
            state.singleLogoutRequest_to_resolve[ticket]?.(req.body.logoutRequest)
        }
        res.send('')
    })
    state.server = app.listen(conf.backChannelServer.port, () => {
        //console.log(`Started on port ${conf.backChannelServer.port}!`)
    })
}

function stop_if_running() {
    state.server?.close()
}

const expectSingleLogoutRequest = (ticket, timeout_ms) => (
    new Promise((resolve, reject) => {
        state.singleLogoutRequest_to_resolve[ticket] = resolve
        setTimeout(_ => {
            reject(`timeout waiting for single LogoutRequest for ticket ${ticket}`)
        }, timeout_ms)
    })
)

module.exports = { state, start_if_not_running, stop_if_running, expectSingleLogoutRequest }
