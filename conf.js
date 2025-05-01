const cas_base_url = 'https://cas.univ.fr/cas'

module.exports = {
    cas_base_url,
    cas_base_url_internal: cas_base_url,
    flavor: 'apereo_cas', // one of: apereo_cas, shibboleth or lemonldap
    //tgc_name: 'TGC', // by default, computed based on conf.flavor

    features: ['proxy', 'single_logout', 'samlValidate'],

    test_services: {
        p2: 'http://localhost/',
        p3: 'http://localhost/',
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
};
