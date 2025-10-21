const { popen } = require("./helpers");

const cas_base_url = 'https://cas.univ.fr/cas'

module.exports = {
    cas_base_url,
    cas_base_url_internal: cas_base_url,
    flavor: 'apereo_cas', // one of: apereo_cas, shibboleth or lemonldap
    //tgc_name: 'TGC', // by default, computed based on conf.flavor

    features: ['proxy', 'single_logout', 'samlValidate'],

    test_services: {
        no_attrs: 'http://localhost/',
        with_attrs: 'http://localhost/',
        samlValidate: 'http://localhost/',
        proxy: ['http://localhost/', 'imap://localhost'],
    },

    user: {
        login: 'test',
        mail: 'test@univ.fr',
        password: 'xxx',
    },
    user_for_fc: {
        login: 'pldupont',
        mail: 'Paul-Louis.Dupont@univ.fr',
        password: 'xxx',
    },        

    kerberos: {
        realm: 'UNIV.FR',        
        flavor: 'MIT', // or 'Heimdal'
    },

    backChannelServer: {
        port: 3000,
        // require: ssh -R 3000:localhost:3000 cas-test -N
        frontalUrl: 'https://cas-test.univ.fr/test-proxy',
    },

    api: {
        cas_direct_url: 'http://localhost:8080/cas',
        run_curl_cmd: (curl_cmd) => popen(curl_cmd, 'ssh', ['-o', 'PreferredAuthentications=gssapi-with-mic', 'cas-test', 'sh']),
    },
};
