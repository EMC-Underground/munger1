var AWS = require( "aws-sdk" );
var chalk = require( "chalk" );
var Q = require( "q" );
var	config = require( "./config.json" ),
	numWaits;

// AWS.config.loadFromPath(__dirname + '/config.json');

// setup ECS config to point to Bellevue lab 
/*
var ECSconfig = {
  s3ForcePathStyle: true,
  accessKeyId: 'dyoung',
  secretAccessKey: '9zD8FC0Ux3j5E9tOWAomkotu05iNd6QGOT6bI2It',
  endpoint: new AWS.Endpoint('http://10.4.44.125:9020')
}
var ecs = new AWS.S3(ECSconfig)
*/

var readFileQ = Q.denodeify(fs.readFile);

readFileQ('myfile.txt', 'utf8')
.then(function(myFileContents) {
  console.log(myFileContents);
  return readFileQ('anotherfile.txt', 'utf8');
})
.then(function(anotherFileContents) {
  console.log(anotherFileContents);
})
.fail(function(err) {
  console.error('error: ' + err.message);
});

console.log(promise)

/*

(function mungeData() {
	console.log('top of loop');
	
	pullIBData
	
	// put the data in the ECS bucket
	var params = {
		Bucket: 'installbase-json',
		Key: msgBody.gdun,
		Body: JSON.stringify(results),
		//ContentType: 'json'
	  };	  
	  
	ecs.putObject(params, function(err, data) {
		if (err) {
			// an error occurred
			console.log( chalk.red('Error in ECS putObject: ' + err, err.stack) ); 
		} else {
			// successful response
			var eTag = JSON.parse(data.ETag);
			console.log( chalk.green('data saved to ECS object ETag: ' + JSON.parse(data.ETag)) );

		};
	});
	
	
	if ( myError ) {
		throw(
			workflowError(
				"EmptyQueue",
				new Error( "There are no messages to process." )
			)
		);
	}

    .then(
		numWaits++
        function insertWait(numWaits) {
			// execute the wait function after 5 seconds
			setTimeout(reportWhenDone, 5000);
			console.log( chalk.green( "starting wait" ) );

        }
    )
    .catch(
        function handleError( error ) {
          switch ( error.type ) {
                case "EmptyQueue":
                    console.log( chalk.cyan( "Expected Error:", error.message ) );
                break;
                default:
                    console.log( chalk.red( "Unexpected Error:", error.message ) );
                break;
            }

        }
    )
    .finally( mungeData );

})();

function reportWhenDone() {
	console.log( chalk.green( "wait complete" ) );
}

function workflowError( type, error ) {

    error.type = type;

    return( error );

}
*/