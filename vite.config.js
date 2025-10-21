import { defineConfig } from 'vite'

export default defineConfig({
 test: {
    globals: true,
    testTimeout: 10/*seconds*/ * 1000,
    projects: [
      { extends: true, test: {
          include: ['tests/*.js'],
          exclude: ['tests/kerberos.test.js'],
          name: 'other',
      } },
      { extends: true, test: {
          include: ['tests/kerberos.test.js'],
          name: 'kerberos',
          env: { KRB5CCNAME: 'krb5cc_test' },
      } },
    ],
 },
})
