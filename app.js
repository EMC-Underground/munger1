

/***************************************************************************************************************
****************************************************************************************************************

This is a microservice that extracts insights about the EMC install base from data originating from Ops Console.
It runs continuously, hosted on Pivotal Cloud Foundry. Every 24 hours it queries the Elastic Cloud Storage (ECS)
object store which hosts EMC field inventory info in JSON format. It then:

- Pulls the current master list of customer GDUNs from the ECS repo.
- Iterates through each type of 'INSTANCE_PRODUCT_FAMILY' aka Product Family (for example, 'VNX')
- For each Product Family, it then iterates through all of the customer GDUNs.
- For each customer GDUN, it pulls the install base data from ECS and extracts the system count for each 
  (for example: how many VNXs at that GDUN).
- It then stores the result in a lightweight sanitized JSON format in s3.

The result is a list of objects (number of objects = number of GDUNS x number of Product Families) stored in s3.
The name format used is <GDUN>.<Product Family>. The insight is stored under <GDUN>.<Product Family>.key1

The objects can then be queried by front end apps like an Alexa Skill to return answers to questions like:
'How many VNXs does CustomerXYZ have?'

/***************************************************************************************************************
****************************************************************************************************************/


var AWS = require( "aws-sdk" ),
	ECS = require( "aws-sdk" ),
	async = require( "async" );
		
// setup ECS config to point to Bellevue lab 
var ECSconfig = {
  s3ForcePathStyle: true,
  endpoint: new AWS.Endpoint('http://10.4.44.125:9020')
};
ECS.config.loadFromPath(__dirname + '/ECSconfig.json');
var ecs = new ECS.S3(ECSconfig);

// setup s3 config
AWS.config.loadFromPath(__dirname + '/AWSconfig.json');
var s3 = new AWS.S3();

// launch the Munger1 process
cycleThru();

// This is the master function that calls the 2 supporting functions in series to
// 1) get the list of GDUNS and then 2) process each one
function cycleThru() {	
	var customerListSource = 'PNWandNCAcustomers.json',
		GDUNarray = [];

    async.series([
        // get customer GDUN list from ECS object store
        function(callback) {
            getCustomerList(customerListSource, function(err, GDUNS) {				
                if (err) return callback(err); // return prevents a double callback with process continuing 
				GDUNarray = GDUNS;
				callback(); // this is the callback saying this function is complete
            });
        },
		
        // get install base data for each product family and from each gdun, extract insight, and post to s3
        function(callback) {
            processProduct(GDUNarray, function(err) {             
				if (err) {
					callback(err);
				} else {
					callback(); // this is the callback saying this function is complete
				}			
            });
        },		
    ], function(err) {		
		//restart the whole cycle again from the top after wait time
		setTimeout(function() {
			cycleThru();
		}, 86400000); // 86400000 = loop through 1 every 24 hours			
    });
}

// This function gets the master list of customer GDUNs from the ECS repo.
// It returns that list as the 'GDUNS' array.
function getCustomerList(source, callback) {
	// get json data object from ECS bucket	
	var GDUNS = [];
	var params = {
			Bucket: 'pacnwinstalls',
			Key: source
	};  
	  
	ecs.getObject(params, function(err, data) {
		if (err) {
			callback(err, null); // this is the callback saying getCustomerList function is complete but with an error
		} else { // success					
			//console.log(data.Body.toString()); // note: Body is outputted as type buffer which is an array of bytes of the body, hence toString() 
			var dataPayload = JSON.parse(data.Body);
			
			// load GDUNS array
			for (var i = 0; i < dataPayload.length; i++) {
				GDUNS.push(dataPayload[i].gduns);
			}
			
			// free up memory
			data = null; // 
			dataPayload = null;
			
			callback(null, GDUNS)  // this is the callback saying getCustomerList function is complete
		}
	});
}

// This function takes the list of all 'INSTANCE_PRODUCT_FAMILY' entries and for each one, it
// launches the 'processGDUN' function.
function processProduct(GDUNlist, callback) {
	var productFamilyList = getProductFamily();
	
	async.forEach(productFamilyList, function(product, callback) {

		processGDUN(product, GDUNlist, function(err) {             
			if (err) {
				callback(err); // this is the callback saying this function is complete but with error
			} else {
				callback(); // this is the callback saying this function is complete
			}			
		});					
	
	}, 	function(err) {
			if (err) return callback(err);
			callback(); // this is the callback saying all items in the async.forEach are completed
	});
}
		
// This function takes a given type of 'INSTANCE_PRODUCT_FAMILY' (for example, 'VNX'), and iterates through all of the customer GDUNs,
// pulling the install base data from ECS for each GDUN, extracting the system count for each (for example: how many VNXs at that GDUN).
// It then stores the result in a lightweight sanitized JSON format in s3.	
function processGDUN(product, GDUNlist, callback) {
	async.forEach(GDUNlist, function(gdun, callback) {
		var insightToStore;

		async.series([
			// Pull install base data from ECS 
			function(callback) {
				getIBdata(product, gdun, function(err, insight) {
					if (err) {
						console.log('Error getting install base data for GDUN: ' + gdun + '\n       Error = ' + err);
						callback(err); // this is the task callback saying this function is complete but with an error;	
					} else {
						insightToStore = insight;
						callback(); // this is the task callback saying this function is complete;					
					}
				});
			},
			// Store the resulting insight in s3
			function(callback) {
				storeInsight(product, gdun, insightToStore, function(err, eTag) {
					if (err) return callback(err); // task callback saying this function is complete but with an error, return prevents double callback
					callback(); // this is the task callback saying this function is complete;
				});
			},
		], function(err) { // this function gets called after the two tasks have called their "task callbacks"
			if (err) {
				callback(err); // this is the callback saying this run-thru of the series is complete for a given gdun in the async.forEach but with error
			} else {
				callback(); // this is the callback saying this run-thru of the series is complete for a given gdun in the async.forEach 				
			}
		});						
	
	}, 	function(err) {
			if (err) return callback(err);
			callback(); // this is the callback saying all items in the async.forEach are completed
	});
}	

// This function pulls the install base data for a given GDUN, calls the function to extract the insight, and then provides the insight 
// in a callback to the calling function.
function getIBdata(product, gdun, callback) {
	var key = gdun + '.json';

	// get json data object from ECS bucket
	var params = {
			Bucket: 'pacnwinstalls',
			Key: key
	};	  
	  
	ecs.getObject(params, function(err, data) {
		if (err) {
			callback(err); 
		} else { // install base data was successfully loaded, so now get insight from data					
			var dataPayload = JSON.parse(data.Body);
			insight = extractInsight(product, dataPayload); 
			data = null; // free up memory
			dataPayload = null; // free up memory
			callback(null, insight); // this is the  callback saying this getIBdata function is complete;
		}
	});	
}


// This function stores the insight in s3
function storeInsight(product, gdun, insightToStore, callback) {	
	// create JSON formatted object body to store
	var insightBody = {
	  "key1": insightToStore.toString()
	}			
	var productKey = product;
	
	if (productKey == 'VNX/VNXe Family') {
		productKey = 'VNX';
	}
	
	// put the data in the s3 bucket
	var s3params = {
			Bucket: 'emcalexa',
			Key: gdun + '.' + productKey,
			Body: JSON.stringify(insightBody),
			ContentType: 'json'
		};	

	s3.putObject(s3params, function(err, data) {
		if (err) { 
			callback(err); // this is the  callback saying this storeInsight function is complete but with error							
		} else { 
			// successful response	
			console.log('posted to s3 as: ' + gdun + '.' + productKey);								
			var eTag = JSON.parse(data.ETag);
			data = null; // free up memory
			callback(null, eTag); // this is the  callback saying this storeInsight function is complete
		}						
	});
}


// This function returns the insight to the calling function. The insight is a count of the number of systems of a given
// type of 'INSTANCE_PRODUCT_FAMILY' found in the IB JSON of a given customer GDUN.
function extractInsight(productFamily, installBaseData) {
	var count = 0;
	for (var i = 0; i < installBaseData.rows.length; i++) {
		if (installBaseData.rows[i].INSTANCE_PRODUCT_FAMILY == productFamily) {
			count++;
		}
	}
	installBaseData = null; // free up memory
	return count;
}

// This function returns a list of all the 'INSTANCE_PRODUCT_FAMILY' options as an array to the calling function
function getProductFamily() {
	var	productFamily = [ // this is the full list available from within Ops Console
		// 'AVALON'
		// 'ApplicationXtender Products'
		// 'Atmos'
		// 'Avamar'
		   'CLARiiON',
		// 'Captiva Products'
		   'Celerra',
		   'Centera',
		   'CloudArray',
		// 'Connectrix'
		// 'DSSD'
		   'Data Domain',
		// 'Data Protection Advisor Family'
		// 'Disk Library'
		// 'DiskXtender'
		// 'Document Sciences'
		// 'Documentum'
		// 'EMC Secure Remote Services'
		// 'Elastic Cloud Storage'
		// 'Greenplum'
		// 'Isilon'
		// 'Kazeon'
		// 'LEAP'
		// 'Mainframe Data Library'
		// 'MirrorView'
		// 'NA'
		// 'Navisphere'
		// 'NetWin'
		// 'NetWorker Family'
		// 'Pivotal'
		// 'PowerPath'
		// 'RSA'
		// 'Rainfinity'
		   'RecoverPoint',
		// 'Retrospect'
		   'ScaleIO Family',
		// 'Smarts'
		// 'SourceOne'
		   'Symmetrix',
		// 'Symmetrix Enginuity'
		// 'UN'
		   'Unity Family',
		   'VMAX Family',
		// 'VMware'
		   'VNX/VNXe Family',
		   'VPLEX Series',
		// 'VSI Plugin Series for VMware vCenter'
		// 'VSPEX BLUE Appliance'
		// 'ViPR Family'
		// 'Watch4Net Family'
		// 'WysDM'
		   'Xtrem'
	];

	return(productFamily)
}