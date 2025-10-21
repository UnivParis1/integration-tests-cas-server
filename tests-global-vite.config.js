import { defineConfig } from 'vite'

export default defineConfig({
  test: {
    globals: true,
    include: ['tests-global/*.js'],
    fileParallelism: false, // api.test and throttle.test can not be run in parallel with other tests
  },
})
