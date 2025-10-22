const util = require('util')
const spawn = require('child_process').spawn;

function popen (inText, cmd, params) {
    let p = spawn(cmd, params); 
    p.stdin.write(inText);
    p.stdin.end();

    return new Promise((resolve, reject) => {
        let output = '';
        let get_ouput = (data) => { output += data; };
  
        p.stdout.on('data', get_ouput);
        p.stderr.on('data', get_ouput);
        p.on('error', event => {
            reject(event);
        });
        p.on('close', code => {
            if (code === 0) resolve(output); else reject(output);
        });
    });
}   

function samlRequest(ticket) {
    const SAML_SOAP_ENV = '<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/"><SOAP-ENV:Header/>';
    const SAML_SOAP_BODY = '<SOAP-ENV:Body>';
    const SAMLP_REQUEST = '<samlp:Request xmlns:samlp="urn:oasis:names:tc:SAML:1.0:protocol"  MajorVersion="1" MinorVersion="1" RequestID="_192.168.16.51.1024506224022" IssueInstant="2002-06-19T17:03:44.022Z">';
    const SAMLP_REQUEST_CLOSE = '</samlp:Request>';
    const SAML_ASSERTION_ARTIFACT = '<samlp:AssertionArtifact>';
    const SAML_ASSERTION_ARTIFACT_CLOSE = '</samlp:AssertionArtifact>';
    const SAML_SOAP_BODY_CLOSE = '</SOAP-ENV:Body>';
    const SAML_SOAP_ENV_CLOSE = '</SOAP-ENV:Envelope>';

    return SAML_SOAP_ENV + SAML_SOAP_BODY + SAMLP_REQUEST
        + SAML_ASSERTION_ARTIFACT + ticket + SAML_ASSERTION_ARTIFACT_CLOSE
        + SAMLP_REQUEST_CLOSE + SAML_SOAP_BODY_CLOSE + SAML_SOAP_ENV_CLOSE;
}

function get_delete(o, key) {
    const val = o[key];
    delete o[key];
    return val;
}

const setTimeoutPromise = util.promisify(setTimeout);

async function waitSeconds(seconds) {
    await setTimeoutPromise(seconds *1000)
}

// NB: works with duration > 24 days
async function waitHours(hours) {
    while (hours >= 0) {        
        await setTimeoutPromise(60*60*1000)
        hours--
    }
}

function throw_(e) { throw(e) }

module.exports = { popen, samlRequest, get_delete, waitSeconds, waitHours, throw_ }