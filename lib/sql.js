var events = require('events');
var util = require('util');

var pg = require('pg');
var Promise = require('bluebird');

// --------------------------------------------------------------------------------------------------------------------

/**
 * Connect to the given database.
 *
 * @todo Document parameters.
 */
function connect(connectionInfo)
{
    return new Promise(function(resolve, reject)
    {
        pg.connect(connectionInfo, function(error, client, done)
        {
            if(error)
            {
                console.error("Error connecting to %j: %s", connectionInfo, error.stack || error);

                return reject(error);
            } // end if

            console.log("Connected to %j", connectionInfo);

            resolve(new Connection(client, done));
        }); // end pg.connect callback
    }); // end Promise callback
} // end connect

// --------------------------------------------------------------------------------------------------------------------

/**
 * Wraps a PostgreSQL connection.
 *
 * @param {pg.Client} client - the `node-postgres` client
 * @param {function} done - the function to release the client to the `node-postgres` pool
 */
function Connection(client, done)
{
    this.client = client;
    this.done = done;
} // end Connection

util.inherits(Connection, events.EventEmitter);

/**
 * The definition of a PostgreSQL query.
 *
 * @typedef {object} Connection#QueryDef
 * @see {@link https://github.com/brianc/node-postgres/wiki/Prepared-Statements}
 *
 * @property {*} queryID - the ID of the query (an arbitrary value provided by the client)
 * @property {string} [name] - if supplied, creates or uses a prepared statement with the given name
 * @property {string} [text] - the text of the SQL query to run or prepare (required unless using a prepared statement)
 * @property {Array} [values] - the values of the query parameters
 */

/**
 * A row has been generated by a database query.
 *
 * @event Connection#row
 *
 * @param {*} queryID - the ID of the query that generated this row
 * @param {object} row - the row
 */

/**
 * An error occurred on this connection.
 *
 * @event Connection#error
 *
 * @param {object} error - the error that occurred
 */

/**
 * "Close" this connection.
 *
 * Actually, this releases the underlying client back to the to the `node-postgres` pool.
 */
Connection.prototype.close = function()
{
    this.done();

    delete this.client;
    delete this.done;
}; // end Connection#close

/**
 * Execute a query on this PostgreSQL connection.
 *
 * @param {Connection#QueryDef} queryDef - the definition of the query to run
 *
 * @returns {Promise.<{rows: number, affected: number}>} - a promise for the statistics of the query once it's finished
 */
Connection.prototype.query = function(queryDef)
{
    var self = this;

    var queryID = queryDef.queryID;
    delete queryDef.queryID;

    return new Promise(function(resolve, reject)
    {
        console.log("Running query %j: %j", queryID, queryDef);

        self.client.query(queryDef)
            .on('error', function(error)
            {
                console.error("Query %j got error: %s", queryID, error.stack || error);

                reject(error);
            }) // end 'error' handler

            .on('row', function(row, result)
            {
                result.returnedRowCount = (result.returnedRowCount || 0) + 1;

                self.emit('row', queryID, row);
            }) // end 'row' handler

            .on('end', function(result)
            {
                console.log("Query %j finished. (%s row%s returned, %s row%s affected)", queryID,
                    result.returnedRowCount, result.returnedRowCount == 1 ? '' : 's',
                    result.rowCount, result.rowCount == 1 ? '' : 's'
                );

                resolve({ rows: result.returnedRowCount, affected: result.rowCount });
            }); // end 'end' handler

    }); // end Promise callback
}; // end Connection#query

// --------------------------------------------------------------------------------------------------------------------

module.exports = {
    connect: connect,
    Connection: Connection
};