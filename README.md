# Directus - PostgreSQL JSON Views - WIP/POC, NO PRODUCTION USE

## Background

Directus is a powerful, open-source, extensible, and easy-to-use web database management system.

It works really well for many use case, but for really complex database structure where you need the get the whole object, It can greatly affect performance or even render the application unresponsive until the complex queries are completed.
What we are trying to achieve here is to offload the heavy JSON serialization to the database, and to have a view that can be used to retrieve the object.
This way, directus still is used to retrieve the object, but the workload itself is offloaded to the database.

This is still a work in progress.  We tested it with pretty complex database structures, but it is not yet ready for production use.



## TODOS
- [ ] Finish the query system
- [ ] Implement security - this needs to be looked at as the views are created for all children, therefore, when a user is not allowed to see a child, we need to implement a mechanism to prevent the view from being created/requested.
- [ ] Code Cleanup - refactoring, cleanup, Types, etc.
- [ ] Add tests
- [ ] Add documentation
- [ ] Delete a view
- [ ] Implement the front end in directus so we can add views directly from the ui
- [ ] Return the right type on null (array, object, string, etc)
- [ ] Apply Queries when creating the views to filter children that are fetched
- [ ] Add options to remove unwanted fields from the view - and default with sensitive values like passwords
- [ ] Add an option to specify the depth of the children to be fetched
- [ ] Add an option to use materialized views instead of a plain view
- [ ] Check to see if nested table exists




## Usage
### Queries are not implemented yet, so find returns all the objects
Endpoint ROOT: /pg-json-views
- On a view creation, 2 postgresql functions are created/updated.
- '/': 'List the available endpoints for this extension. (You are here)',
- '/create/[collection]': 'Creates or Replaces a view from the given directus table name from directus schema',
- '/get/[collection]/all':Get all rows from a view limited to 100.  Use find with a bigger limit if you need more.  Use directus table name.',
- '/get/[collection]/find?[field1=value&field2=value][options]':'Query specific fields from a view using directus table name.  Dot notation can be used to query nested fields.  Returns an array.',
- '/get/[collection]/findone?[field1=value&field2=value]':'Query specific fields from a view using directus table name.  Dot notation can be used to query nested fields. Returns a single object',



## Contributing




## License
