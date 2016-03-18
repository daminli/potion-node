import 'core-js/shim';
import 'reflect-metadata';
import {Observable} from 'rxjs/Observable';
import 'rxjs/add/observable/concat';
import 'rxjs/add/observable/fromPromise';
import 'rxjs/add/operator/mergeMap';
import 'rxjs/add/operator/toPromise';


export interface Cache<T extends Item> {
	get(id: string): T;
	set(id: string, item: T): T;
}


interface ItemConstructor {
	store?: Store<Item>;
	new (object: any): Item;
}

export class Item {
	uri: string;

	get id() {
		if (!this.uri) {
			return null;
		}

		const potion = <PotionBase>Reflect.getMetadata('potion', this.constructor);
		const {params} = potion.parseURI(this.uri);
		return parseInt(params[0]);
	}

	static store: Store<Item>;

	static fetch(id): Observable<Item> {
		return this.store.fetch(id);
	}

	static create(attrs: any = {}) {
		return new this(attrs);
	}

	constructor(attrs: any = {}) {
		Object.assign(this, attrs);
	}

	toJSON() {
		const attrs = {};

		Object.keys(this)
			.filter((key) => key !== 'uri')
			.forEach((key) => {
				attrs[key] = this[key];
			});

		return attrs;
	}

}


// Snake case to camel case
function _toCamelCase(string) {
	return string.replace(/_([a-z0-9])/g, (g) => g[1].toUpperCase());
}

// http://www.2ality.com/2015/08/es6-map-json.html
function _strMapToObj(map: Map) {
	let obj = {};
	// TODO: investigate why for..of does not work
	map.forEach((v, k) => obj[k] = v);
	return obj;
}

interface ParsedURI {
	resource: Item,
	params: string[]
}

export abstract class PotionBase {
	resources = {};
	prefix: string;
	cache: Cache;
	private _observables = [];

	static create() {
		return Reflect.construct(this, arguments);
	}

	constructor({prefix = '', cache = {}} = {}) {
		Object.assign(this, {prefix, cache});
	}

	parseURI(uri: string): ParsedURI {
		uri = decodeURIComponent(uri);

		if (uri.indexOf(this.prefix) === 0) {
			uri = uri.substring(this.prefix.length);
		}

		for (let [resourceURI] of Object.entries(this.resources)) {
			if (uri.indexOf(`${resourceURI}/`) === 0) {
				return {uri, resource: this.resources[resourceURI], params: uri.substring(resourceURI.length + 1).split('/')};
			}
		}

		throw new Error(`Uninterpretable or unknown resource URI: ${uri}`);
	}

	private _fromPotionJSON(json: any): Promise<any> {
		// TODO: implement custom deserialization


		console.log('JSON: ', json);

		if (typeof json === 'object' && json !== null) {
			if (json instanceof Array) {
				console.log('IS ARRAY');
				return Promise.all(json.map((item) => this._fromPotionJSON(item)));
			} else if (typeof json.$uri == 'string') {

				// TODO: it's an uri, try to resolve from cache
				console.log('IS URI');

				const {resource, uri} = this.parseURI(json.$uri);
				const promises = [];

				for (const key of Object.keys(json)) {
					if (key == '$uri') {
						promises.push(Promise.resolve([key, uri]));
						// } else if (constructor.deferredProperties && constructor.deferredProperties.includes(key)) {
						// 	converted[toCamelCase(key)] = () => this.fromJSON(value[key]);
					} else {
						promises.push(this._fromPotionJSON(json[key]).then((result) => {
							return [_toCamelCase(key), result]
						}));
					}
				}

				return Promise.all(promises).then((results) => {
					results = _strMapToObj(new Map(results));

					let instance;
					if (this.cache.get && !(instance = this.cache.get(uri))) {
						instance = new resource(results);

						if (this.cache.set) {
							this.cache.set(uri, <any>instance);
						}
					} else {
						Object.assign(instance, results);
					}

					return json;
				});
			} else if (Object.keys(json).length === 1) {
				// TODO: implement recursive ref resolve
				// TODO: implement date deserialize
				// if (typeof json.$ref === 'string') {
				// 	let {uri} = this.parseURI(json.$ref);
				// 	return this.request(uri).toPromise();
				// } else if (typeof json.$date !== 'undefined') {
				// 	return Promise.resolve(new Date(json.$date));
				// }
			}

			const promises = [];

			for (const key of Object.keys(json)) {
				promises.push(this._fromPotionJSON(json[key]).then((result) => {
					return [_toCamelCase(key), result]
				}));
			}

			return Promise.all(promises).then((results) => {
				return _strMapToObj(new Map(results));
			});

		} else {
			return Promise.resolve(json);
		}
	}

	abstract fetch(uri, options?: RequestInit): Observable<any>;

	request(uri, options?: RequestInit): Observable<any> {
		let instance;

		// Try to get from cache
		if (this.cache.get && (instance = this.cache.get(uri))) {
			return Observable.create((observer) => observer.next(instance));
		}

		// If we already asked for the resource,
		// return the exiting observable.
		let obs = this._observables[uri];
		if (obs) {
			return obs;
		}

		// Register a pending request,
		// get the data,
		// and parse it.
		obs = this._observables[uri] = this.fetch(`${this.prefix}${uri}`, options).mergeMap((json) => {
			delete this._observables[uri]; // Remove pending request
			return Observable.fromPromise(this._fromPotionJSON(json));
		});

		return obs;
	}

	register(uri: string, resource: ItemConstructor) {
		Reflect.defineMetadata('potion', this, resource);
		Reflect.defineMetadata('potion:uri', uri, resource);
		this.resources[uri] = resource;
		resource.store = new Store(resource);
	}

	registerAs(uri: string): ClassDecorator {
		return (target: ItemConstructor) => {
			this.register(uri, target);
			return target;
		}
	}
}


class Store<T extends Item> {
	private _itemConstructor: ItemConstructor;
	private _potion: PotionBase;
	private _rootURI: string;

	constructor(itemConstructor: ItemConstructor) {
		this._itemConstructor = itemConstructor;
		this._potion = Reflect.getMetadata('potion', itemConstructor);
		this._rootURI = Reflect.getMetadata('potion:uri', itemConstructor);
	}

	fetch(id: number): Observable<T> {
		const uri = `${this._rootURI}/${id}`;

		return new Observable<T>((observer) => {
			this._potion
				.request(uri, {method: 'GET'})
				.subscribe((resource) => observer.next(new this._itemConstructor(Object.assign({}, {uri}, resource))), (error) => observer.error(error));

		});
	}
}


function _route(uri: string, {method = 'GET'} = {}): (any?) => Observable<any> {
	return function (options: any = {}) {
		let potion: PotionBase;

		if (typeof this === 'function') {
			potion = <PotionBase>Reflect.getMetadata('potion', this);
			uri = `${Reflect.getMetadata('potion:uri', this)}${uri}`;
		} else {
			potion = <PotionBase>Reflect.getMetadata('potion', this.constructor);
			uri = `${this.uri}${uri}`;
		}

		return potion.request(uri, {method});
	}
}

export class Route {
	static GET(uri: string): (any?) => Observable<any> {
		return _route(uri, {method: 'GET'});
	}

	static DELETE(uri: string): (any?) => Observable<any> {
		return _route(uri, {method: 'DELETE'});
	}

	static PATCH(uri: string): (any?) => Observable<any> {
		return _route(uri, {method: 'PATCH'});
	}

	static POST(uri: string): (any?) => Observable<any> {
		return _route(uri, {method: 'POST'});
	}

	static PUT(uri: string): (any?) => Observable<any> {
		return _route(uri, {method: 'PUT'});
	}
}
