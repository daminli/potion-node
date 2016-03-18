module.exports = function (config) {
	config.set({
		frameworks: [
			'jasmine',
			'jspm'
		],
		reporters: [
			'spec'
		],
		jspm: {
			browser: 'jspm.browser.js',
			config: 'jspm.config.js',
			serveFiles: ['src/**/*!(*.spec).ts', 'tsconfig.json', 'typings/**/*.d.ts'],
			loadFiles: ['src/**/*.spec.ts']
		},
		plugins: [
			'karma-chrome-launcher',
			'karma-jasmine',
			'karma-jspm',
			'karma-spec-reporter'
		],
		proxies: {
			'/jspm_packages/': '/base/jspm_packages/',
			'/src/': '/base/src/',
			'/tsconfig.json': '/base/tsconfig.json',
			'/typings/': '/base/typings/'
		},
		logLevel: config.LOG_INFO,
		browsers: [
			'Chrome'
		]
	});
};