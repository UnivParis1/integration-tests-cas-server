const cheerio = require('cheerio');
const undici = require('undici')
const { throw_ } = require('./helpers')

const verbose = false


const toArray = (e) => (
    typeof e === 'string' ? [e] : e
)

function $first(resp, selector) {
    const elt = resp.$(selector).first()
    if (elt.length === 0) throw `expected ${selector} in html ${resp.body}`
    return elt
}

const cookiesToString = (map) => (
    map ? Object.entries(map).map(name_value => name_value.join('=')).join('; ') : ''
)

const new_navigate_until_service = (service) => (
    { noFollowIf: resp => resp.headers.location.startsWith(service) }    
)

function add_cookie(ua, url, name, value) {
    ((ua.cookieJar ??= {})[new URL(url).origin] ??= {})[name] = value
    return ua
}

function add_cookie_on_prev_url(ua, name, value) {
    add_cookie(ua, ua.prevUrl.origin, name, value)
}

// NB: undici.request allow things "fetch" can't do: set mode "navigate" which is checked by FC

async function navigate(ua, url, params) {
    url = new URL(url, ua.prevUrl)

    // may add cookies collected from previous navigation
    params ??= {}
    params.headers ??= {}
    params.headers.cookie ??= cookiesToString(ua.cookieJar?.[url.origin])
    params.headers['User-Agent'] ??= 'xxxx' // pour FranceConnect avec Apereo CAS 7.0 ...
    if (verbose) console.log(`${params.method || 'GET'} ${url.href}
  using cookies: ${params.headers.cookie}
  and body ${params.body}`)

    // call the url
    const resp = await undici.request(url, params)
    const location = resp.headers.location

    if (verbose && location) console.log("response redirect to", location)

    // store prevUrl & cookies in ua
    ua.prevUrl = url
    if (resp.headers['set-cookie']) {
        ua.cookieJar ??= {}
        ua.cookieJar[url.origin] ??= {}
        for (const cookie of toArray(resp.headers['set-cookie'])) {
            const [, name, value] = cookie.match(/([^;=]*)=([^; ]*)/)
            if (cookie.match(/expires=Thu, 01 Jan 1970 00:00:00 GMT/)) {
                delete ua.cookieJar[url.origin][name]
            } else {
                ua.cookieJar[url.origin][name] = value
            }
        }
        //if (verbose) console.log(resp.headers['set-cookie'])
        if (verbose) console.log(`cookieJar updated for ${url.origin} : ${JSON.stringify(ua.cookieJar[url.origin])}`)
    }

    if (resp.statusCode === 302) {
        if (!ua.noFollowIf?.(resp)) {
            // transparent redirect
            return await navigate(ua, location ?? throw_("no redirect to follow"))
        }
    } else if (resp.statusCode !== 200) {
        throw { 
            error: `expected HTTP 200, got HTTP ${resp.statusCode} for url ${url.href}`,
            status: resp.statusCode,
            body: await resp.body.text(),
        }
    }
    const body = await resp.body.text()
    const $ = resp.headers['content-type']?.startsWith('text/html') ? cheerio.load(body) : undefined
    return { cookies: ua.cookieJar?.[url.origin], location, body, $ }
}

async function form_post(ua, $) {
    return await navigate(ua, $("form").attr('action'), { method: 'POST', headers: {
		'Content-type': 'application/x-www-form-urlencoded',
        'Accept': 'text/html',
	}, body: $("form").serialize() })
}

module.exports = { new_navigate_until_service, add_cookie, add_cookie_on_prev_url, navigate, form_post, $first }