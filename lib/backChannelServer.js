const express = require('express');
const bodyParser = require('body-parser')
const conf = require('../conf');


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
    app.post('/app[12]', bodyParser.urlencoded({ extended: false }), (req, res) => { 
        const ticket = req.body?.logoutRequest?.match(/<samlp:SessionIndex>([^<]*)/)?.[1]
        //console.log('POST', req.path, ticket)
        if (!ticket) {
            console.error("expected single logoutRequest, got", req.body)
        } else {
            const resolve = state.singleLogoutRequest_to_resolve[`${req.path}:${ticket}`]
            if (resolve) {
                resolve(req.body.logoutRequest)
            } else {
                console.error(`unexpected logoutRequest on ${req.path} & ticket ${ticket}`)
            }
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

const expectSingleLogoutRequest = (app_path, ticket, timeout_ms) => (
    new Promise((resolve, reject) => {
        state.singleLogoutRequest_to_resolve[`${app_path}:${ticket}`] = resolve
        setTimeout(_ => {
            reject(`timeout waiting for single LogoutRequest from ${app_path} & ticket ${ticket}`)
        }, timeout_ms)
    })
)

module.exports = { state, start_if_not_running, stop_if_running, expectSingleLogoutRequest }
