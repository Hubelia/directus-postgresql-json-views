'use strict';
import { Knex } from 'knex';

import { getRelationType } from '@directus/shared/utils';
import ViewBuilder = Knex.ViewBuilder;
import { cloneDeep } from 'lodash';

const checkPermissions = (collection, user)=> {
  // Temporary fix for the permissions on directus tables
	return !collection.toLowerCase().includes('directus_');
};

export default {
	id: 'pg-json-views',
	handler: async (router, context) => {
		const { getSchema, services, exceptions, env, database, logger } = context;
		const getRowsFromQuery = async (collection, q, options) => {
			const query = Object.keys(q).reduce((queryString: string, field: string, idx) => {
				const queryStr = ` data->>\'${field}\' = \'${q[field]}\'`;
				if (idx + 1 !== Object.keys(q).length) {
					return queryString + queryStr + ' AND ';
				}
				return queryString + queryStr;
			}, '');
			const knexQuery = () =>
				query && query.length
					? database(collection + '_view')
							.select('data')
							.whereRaw(query)
					: database(collection + '_view').select('data');

			if (options.findOne) {
				return knexQuery()
					.first()
					.then((row) => row.data);
			}
			return options.order
				? knexQuery()
						.limit(options.limit || 10)
						.offset(options.offset || 0)
						.orderBy(`data->>\'${options.sort}\'`, options.order || 'asc')
						.then((rows) => rows.map((row) => row.data))
				: knexQuery()
						.limit(options.limit || 10)
						.offset(options.offset || 0)
						.then((rows) => rows.map((row) => row.data));
		};
		const schemas = await getSchema();
		router.get('/', async (req, res) => {
			res.send({
				'/': 'List the available endpoints for this extension. (You are here)',
				'/create/[collection]': 'Creates or Replaces a view from the given directus table name from directus schema',
				'/refresh/[collection]': 'Refresh the Materialized View from the given directus table name from directus schema',
				'/get/[collection]/all':
					'Get all rows from a view limited to 100.  Use find with a bigger limit if you need more.  Use directus table name.',
				'/get/[collection]/find?[field1=value&field2=value][options]':
					'Query specific fields from a view using directus table name.  Dot notation can be used to query nested fields.  Returns an array.',
				'/get/[collection]/findone?[field1=value&field2=value]':
					'Query specific fields from a view using directus table name.  Dot notation can be used to query nested fields. Returns a single object',
			});
		});
		router.get('/get/:collection/all', async (req, res) => {
			//NEED TO ADD AUTH Check if user is authenticated and has access to this collection and child collections

			const { collection } = req.params;
			if(!checkPermissions(collection)){
				return res.status(403).send({
					error: 'Forbidden',
					message: 'You do not have permission to access this collection'
				});
			}
			const result = await getRowsFromQuery(collection, {}, { limit: 100 });
			return res.status(200).send(result);
		});
		router.get('/refresh/:collection', async (req, res) => {
			//NEED TO ADD AUTH Check if user is authenticated and has access to this collection and child collections
			const { collection } = req.params;
			if(!checkPermissions(collection)){
				return res.status(403).send({
					error: 'Forbidden',
					message: 'You do not have permission to access this collection'
				});
			}
			try{
				await database.schema.refreshMaterializedView(collection+'_view');
				return res.status(200).send({
					message: 'Materialized View refreshed'
				});
			} catch (e) {
				return res.status(500).send({
					error: 'Internal Server Error',
					message: 'Error refreshing materialized view: ' + e.message;
				});
			}
		});
		router.get('/get/:collection/findOne', async (req, res) => {
			//NEED TO ADD AUTH Check if user is authenticated and has access to this collection and child collections
			const { collection } = req.params;
			if(!checkPermissions(collection)){
				return res.status(403).send({
					error: 'Forbidden',
					message: 'You do not have permission to access this collection'
				});
			}
			const result = await getRowsFromQuery(collection, {}, { findOne: true });
			res.status(200).send(result);
			return;
		});
		router.get('/get/:collection/find', async (req, res) => {
			//NEED TO ADD AUTH Check if user is authenticated and has access to this collection and child collections
			const { collection } = req.params;
			if(!checkPermissions(collection)){
				return res.status(403).send({
					error: 'Forbidden',
					message: 'You do not have permission to access this collection'
				});
			}
			const result = await getRowsFromQuery(collection, {}, {});
			res.status(200).send(result);
			return;
		});
		router.get('/create/:collection', async (req, res) => {
			//NEED TO ADD AUTH Check if user is authenticated and has access to this collection and child collections
			const cached: object = {};
			const excludedCollection: string[] = ['directus_users', 'directus_groups', 'directus_folders', 'directus_groups'];
			const maxDepth = 3;
			if(!checkPermissions(req.params.collection)){
				return res.status(403).send({
					error: 'Forbidden',
					message: 'You do not have permission to access this collection'
				});
			}
			// This is a recursive function created to make sure I understand the directus schema system
			// This function can be removed down the line and use the directus schema system directly
			const depthLimitReached = (str: string, alias): boolean => str.split(alias).length >= maxDepth;
			const deepSchema = (args: {
				collection: string;
				parentCollection: string | null;
				parent: object;
				path: string;
				alias: string;
			}) => {
				const { collection, parentCollection, alias, path, parent } = args;
				let nestedParent = cloneDeep(parent);
				// The following prevents infinite recursion.
				// We check how many times the alias appears in the path. If it is more than the maxDepth, we stop.
				const noFetch = (alias && path.split(alias).length - 1 >= maxDepth) || excludedCollection.includes(collection);
				const nestedPath = path + collection + '.';
				const collectionSchema = schemas.collections[collection];
				if ((parentCollection && collection === req.params.collection) || noFetch) {
					return { ...collectionSchema.fields, relation: null };
				}
				// If there is no collection schemas, we return an error and cancel the operation.
				if (!collectionSchema) return res.status(404).send({ data: `The collection ${collection} Collection not found` });
				// Some directus relations uses a different mechanism using aliases.  Here we get the aliases that
				// relates to the collection.
				const aliases = Object.keys(collectionSchema.fields)
					.filter((i) => collectionSchema.fields[i].alias)
					.map((i) => collection + '_' + i);
				// The first filer is obvious.  If the collection of the relation is the same, than it is a relation for this collection.
				// the second filter checks if an alias exists for the collection. If it does, than it is a relation for this collection if the related collection.
				// of the relation is the same as the collection.
				const relations = schemas.relations.filter(
					(i) =>
						(i.collection === collection || (aliases.includes(i.collection) && i.related_collection === collection) && i.collection !== req.param.collection
				);
				if (Object.keys(nestedParent).length === 0) {
					nestedParent = { ...collectionSchema.fields };
				}
				// Find the fild that relates to the relationship from the schema
				const getRelationCollectionField = (relation: object) =>
					Object.keys(collectionSchema.fields).find(
						(i) =>
							// If the key is the same as the relation field, it is a relation.
							i === relation.field ||
							// M2A - the following checks for aliases
							// and checks if the relation is related to the right collection in case there are multiple
							// m2a relationshipts in the same collection
							(collectionSchema.fields[i].alias &&
								relation.related_collection === collection &&
								relation.collection.split(collection + '_')[1] === i)
					) || '';

				relations
					.map((m) => {
						// get the field name that relates to the relationship
						const fieldName = getRelationCollectionField(m);
						// get the relation type
						const relationType = getRelationType({
							relation: m,
							collection,
							field: fieldName,
						});
						return { ...m, fieldName, relationType };
					})
					.filter((r) => {
						// The following prevent a relation from looping for m2a as one of the fild of the collection
						// points back to the parent collection - therefore we end up with a loop in the relation.
						// This filters the nested m2o relations to only include the ones that are not pointing back to the parent collection
						const isLooping =
							r.relationType === 'm2o' || r.relationType === 'm2am2o'
								? r.related_collection === parentCollection
								: false;
						return (
							r.fieldName &&
							!isLooping &&
							!depthLimitReached(path, parentCollection + '.' + collection + '.' + r.fieldName)
						);
					})
					.forEach((relation) => {
						const field: string = relation.fieldName;
						if (field) {
							const relationType = relation.relationType;
							const nestedCollection =
								relationType === 'o2m'
									? relation.collection
									: relationType === 'm2a'
									? relation.meta.one_allowed_collections.filter(
											(i) => i !== req.params.collection && !excludedCollection.includes(i)
									  )
									: collection === relation.related_collection ? relation.collection : relation.related_collection ;
							if (nestedCollection) {
								if (Array.isArray(nestedCollection)) {
									nestedParent[field] = nestedCollection.map((i) => {
										const collString = '.' + collection + '.' + i;
										const deepInfo = {
											collection: i,
											path: nestedPath,
											alias: collString,
											parent: {},
											parentCollection: collection,
										};
										return {
											collection: i,
											relation: {
												type: relationType === 'm2a' ? 'm2am2o' : relationType,
												...relation,
											},
											nested: deepSchema(deepInfo),
										};
									});
								} else if (nestedCollection) {
									const collString = '.' + collection + '.' + nestedCollection;
									const deepInfo = {
										collection: nestedCollection,
										parentCollection: collection,
										parent: {},
										path: nestedPath,
										alias: collString,
									};
									const nested = { field: nestedParent[field].field, nested: deepSchema(deepInfo) };
									const rel =
										nestedParent[field].special && nestedParent[field].special.filter((i) => i === 'm2a').length
											? 'm2a'
											: relationType;
									nestedParent[field] = {
										field: nested,
										relation: {
											type: rel,
											...relation,
										},
									};
								}
							}
						}
					});
				return nestedParent;
			};


			cached[req.params.collection] = deepSchema({
				collection: req.params.collection,
				parent: {},
				parentCollection: null,
				path: '',
				alias: req.params.collection,
			});
			// Create the view query string
			const buildSqlQuery = (
				collection: string,
				parent: string | null,
				schema: object,
				q = '',
				type = 'root',
				alias,
				m2aDepth
			) => {
				const stringifyJSON = (data, depth=0) => {
					if (data === undefined)
						return undefined
					else if (data === null)
						return 'null'
					else if (data.constructor === String) {
						function escape (val:string) {
							return val
								.replace(/[\\]/g, '\\\\')
								.replace(/[\/]/g, '\\/')
								.replace(/[\b]/g, '\\b')
								.replace(/[\f]/g, '\\f')
								.replace(/[\n]/g, '\\n')
								.replace(/[\r]/g, '\\r')
								.replace(/[\t]/g, '\\t')
								.replace(/[\"]/g, '\\"')
								.replace(/\\'/g, "\\'");
						}
						return '"'+escape(data)'"'

					}
					else if (data.constructor === Number)
						return String(data)
					else if (data.constructor === Boolean)
						return data ? 'true' : 'false'
					else if (data.constructor === Array)
						return '[ ' + data.reduce((acc, v) => {
							if (v === undefined)
								return [...acc, 'null']
							else
								return [...acc, stringifyJSON(v, depth+1)]
						}, []).join(', ') + ' ]'
					else if (data.constructor === Object)
						return '{' + Object.keys(data).reduce((acc, k) => {
							if (data[k] === undefined)
								return acc
							else
								return [...acc,'"'+ k+'"' + ':' + stringifyJSON(data[k], depth+1)]
						}, []).join(', ') + '"}'
					else
						return '{}'
				}
				const nestedRelations = Object.keys(schema)
					.filter(
						(f: string) =>
							schema[f] && schema[f].relation && !excludedCollection.includes(schema[f].relation.related_collection)
					)
					.map((m) => schema[m]);
				const jsonFunc =
					type === 'root'
						? null
						: type === 'm2o' || type === 'm2am2o'
						? 'row_to_json'
						: type === 'o2m'
						? 'json_agg'
						: type === 'm2a'
						? 'json_agg'
						: 'row_to_json';
				const query =
					!jsonFunc || !q || !q.length
						? `SELECT \"${collection}\".*`
						: `${
								!q.endsWith(',') || !q.endsWith(', ') ? q + ', ' : q
						  } (SELECT ${jsonFunc}(${alias}) FROM (SELECT \"${collection}\".*`;
				return nestedRelations
					.filter((i) => i.relation && i.relation.schema)
					.reduce((acc, field, idx) => {
						const relation = field.relation;
						let foreingCollection, foreingField, localField;
						switch (relation.type) {
							case 'o2m':
								foreingCollection = relation.schema.table;
								foreingField = relation.schema.column;
								localField = relation.schema.foreign_key_column;
								break;
							case 'm2o':
							case 'm2am2o':
								if (!relation.schema) {
									console.error('relation.schema is null', relation);
								}
								foreingCollection = relation.related_collection;
								foreingField = relation.schema.column;
								localField = relation.schema.foreign_key_column;
								break;
							case 'm2a':
								foreingCollection = relation.schema.table;
								foreingField = relation.schema.column;
								localField = relation.schema.foreign_key_column;
								break;
							default:
								return acc;
						}
						const alias = `nested_${collection}_${foreingCollection}`;
						acc = buildSqlQuery(
							foreingCollection,
							collection,
							field.field.nested || {},
							acc,
							relation.type,
							alias,
							m2aDepth
						);
						if (!parent && relation.type === 'o2m') {
							acc += ` FROM ${'"' + foreingCollection + '"'} where ${
								'"' + foreingCollection + '"' + '.' + '"' + foreingField + '"'
							} = ${'"' + collection + '"'}.${'"' + localField + '"'}`;
						} else if (relation.type === 'm2o' || relation.type === 'm2am2o') {
							acc += ` FROM ${'"' + foreingCollection + '"'} where ${
								'"' + collection + '"' + '.' + '"' + foreingField + '"'
							} = ${'"' + foreingCollection + '"'}.${'"' + localField + '"'}`;
						} else if (
							relation.type === 'm2a' &&
							field.field &&
							field.field.nested &&
							field.field.nested.item &&
							Array.isArray(field.field.nested.item)
						) {
							const nestedFields = field.field.nested.item.filter(
								(fi) => fi.collection && !excludedCollection.includes(fi.collection)
							);
							const searchStr = nestedFields.reduce((a, c, idx) => {
								if (c.nested && Object.keys(c.nested).length) {
									const al = alias + `_${c.collection}`;
									a[c.collection] = ` (${buildSqlQuery(
										c.collection,
										foreingCollection,
										c.nested || {},
										'',
										c.relation.type,
										al,
										m2aDepth ? m2aDepth + 1 : 1
									)} `;
								}
								return a;
							}, {});
							if (Object.keys(searchStr).length) {
								try {
									// const objString = stringifyJSON(searchStr)
									const objString = JSON.stringify(searchStr);
									let quotes = "'";
									let a = 0;
									while (a < m2aDepth) {
										const currentQutesCount = quotes.match(new RegExp("'", 'g')).length;
										let b = 0;
										while (b < currentQutesCount) {
											quotes = "'" + quotes;
											b++;
										}
										a++;
									}

									const inlineStr = `${quotes}${objString}${quotes}::JSON `;
									acc += `, (SELECT * FROM DIRECTUS_M2A_GET_ROW_W_NESTED(${'"' + foreingCollection + '"'}.COLLECTION, ${
										'"' + foreingCollection + '"'
									}.ITEM, ${inlineStr}) AS ITEM) FROM "${foreingCollection}" where ${
										'"' + foreingCollection + '"' + '.' + foreingField
									} = ${'"' + collection + '"'}.${'"' + localField + '"'}`;

								} catch (e) {
									// console.error(e, collection, m2aDepth);
									throw e;
								}

							} else {
								acc += `, (SELECT * FROM DIRECTUS_M2A_GET_ROW(${
									'"' + foreingCollection + '"'
								}.COLLECTION, ${foreingCollection}.ITEM) AS ITEM) FROM "${foreingCollection}" where ${
									'"' + foreingCollection + '"' + '.' + '"' + foreingField + '"'
								} = ${'"' + collection + '"'}.${'"' + localField + '"'}`;
							}
						} else {
							acc += ` FROM "${foreingCollection}" where ${'"' + collection + '"' + '.' + '"' + localField + '"'} = ${
								'"' + foreingCollection + '"'
							}.${'"' + foreingField + '"'}`;
						}
						const getField = (obj: object | string) => (typeof obj === 'string' ? obj : getField(obj.field || ''));
						if(relation.meta && relation.meta.sort_field){
							acc += ` ORDER BY "${relation.meta.sort_field}"`;
						}
						acc += `) AS ${alias}) AS ${getField(field)} `
						return acc;
					}, query);
			};
			try {
				await database.raw(`CREATE OR REPLACE FUNCTION DIRECTUS_M2A_GET_ROW_W_NESTED(_COL_NAME ANYELEMENT,_ITEM_ID text, _SUBQUERIES JSON)
RETURNS
SETOF JSON AS $$
BEGIN
\tIF (_subqueries::JSONB->>_COL_NAME) IS NOT NULL
\t\tTHEN RETURN QUERY EXECUTE format('SELECT
\t   row_to_json(t)
    FROM %s FROM "%s" WHERE "%s".id::text=%L::text) t', _subqueries::JSONB->>_COL_NAME, _COL_NAME, _COL_NAME,_item_id::text);
\tELSE
\tRETURN QUERY SELECT '{}'::JSON;
\tEND IF;
END; $$ LANGUAGE 'plpgsql';


CREATE OR REPLACE FUNCTION DIRECTUS_M2A_GET_ROW (_COL_NAME ANYELEMENT,_ITEM_ID text)
RETURNS
SETOF JSON AS $$
BEGIN
    RETURN QUERY EXECUTE format('SELECT
\t   row_to_json(t)
    FROM %s t WHERE t.id::text=%s::text ', _col_name, quote_literal(_item_id)  );
END; $$ LANGUAGE 'plpgsql';`);
				const sqlQuery =
					buildSqlQuery(req.params.collection, null, cached[req.params.collection]) +
					' FROM ' +
					'"' +
					req.params.collection +
					'"';
				const view = req.params.collection + '_' + 'view';
				// Delete the view if it exists
				await database.schema.dropViewIfExists(view).catch(e=>console.warn(e))
				await database.schema.dropMaterializedViewIfExists(view).catch(e=>console.warn(e))
				// Create the view
				const callback = (view) =>{
					console.log(req.query.materialized, view)
					view.columns(['data']);
					view.as(
						sqlQuery && sqlQuery.length
							? database
								.select(database.raw(`row_to_json(${req.params.collection})`))
								.from(database.raw(`(${sqlQuery}) as ${req.params.collection};`))
							: database(req.params.collection).select(database.raw(`row_to_json(${req.params.collection}) as data`))
					);
				}
				if(req.query.materialized === 'true'){
					await database.schema.createMaterializedView(view, function (view: ViewBuilder) {
						callback(view)
					});
				} else {
					await database.schema.createView(view, function (view: ViewBuilder) {
						callback(view)
					});
				}
				res.status(200).send({ data: 'Success' });
			} catch (e) {
				console.error( e.message.substring(e.message.length > 6000 ? e.message.length - 6000 : 0, e.message.length));
				return res.status(500).send({ error: e.message.substring(e.message.length > 50000 ? e.message.length - 50000 : 0, e.message.length) });
			}
		});
	},
};
