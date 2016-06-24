import {
	PotionOptions,
	RequestOptions,
	PotionBase
} from './base';


export {
	readonly,
	Item,
	Route
} from './base';

export default angular.module('potion', []).provider('potion', function () {
	let options = {};

	this.config = (config: PotionOptions) => {
		if (config) {
			return Object.assign(options, config);
		} else {
			return options;
		}
	};

	this.$get = ['$cacheFactory', '$q', '$http', function ($cacheFactory, $q, $http) {
		let cache = $cacheFactory.get('potion') || $cacheFactory('potion');

		class Potion extends PotionBase {
			static promise = $q;

			protected _fetch(url, {method = 'GET', search, data, cache = true}: RequestOptions = {}): Promise<any> {
				return $http(Object.assign({url, method, data, cache}, {params: search})).then(({headers, data}) => ({headers: headers(), data}));
			}
		}

		// Use the $cacheFactory.
		// Allow user to override cache.

		/* tslint:disable: align */
		return new Potion(Object.assign({
			cache
		}, options));
	}];

	return this;
});
