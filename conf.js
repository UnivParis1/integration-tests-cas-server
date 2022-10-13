module.exports = {
    cas_base_url: 'https://cas-test.univ.fr/cas',

    test_services: {
        p2: 'https://ent.univ.fr/',
        p3: 'https://env.univ.fr/',
        samlValidate: 'https://ent.univ.fr/',
        proxy: ['https://courrier.univ.fr', 'imap://localhost'],
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
