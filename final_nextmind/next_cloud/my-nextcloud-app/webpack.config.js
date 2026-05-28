const path = require('path')
const { VueLoaderPlugin } = require('vue-loader')

module.exports = {
	entry: './js/main.js',
	output: {
		filename: 'main.bundle.js',
		path: path.resolve(__dirname, 'js'),
	},
	module: {
		rules: [
			{ test: /\.vue$/, loader: 'vue-loader' },
			{ test: /\.s?css$/, use: ['style-loader', 'css-loader', 'sass-loader'] },
		]
	},
	resolve: { extensions: ['.js', '.vue'] },
	plugins: [ new VueLoaderPlugin() ],
	mode: 'production'
}




