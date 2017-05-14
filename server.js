require('dotenv').config();
var express = require('express'),
	bodyParser = require('body-parser'),
	multiparty = require('connect-multiparty'),
	mongodb = require('mongodb'),
	objectId = require('mongodb').ObjectId,
	fs = require('fs'),
	path = require('path'),
	readChunk = require('read-chunk'),
	fileType = require('file-type'),
	aws = require('aws-sdk');

var app = express();

app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json());
app.use(multiparty());

app.use(function(req, res, next){

	//Use '*' if you want to give access to any origin
	res.setHeader('Access-Control-Allow-Origin', '*'); //Enable cross domain requests
	res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE'); //set which methods are authorized for cross domain requests
	res.setHeader('Access-Control-Allow-Headers', 'Content-Type'); //Enable source header rewrite 
	res.setHeader('Access-Control-Allow-Credentials', true);

	next();
});

var port = 3000;

app.listen(port, function(){
	console.log('Server now listening on port '+port);
});

app.get('/', function(req, res){
	res.send({msg: 'Hello World'});
});

mongodb.MongoClient.connect(process.env.MONGODB_URI, function(err, db) {

	var posts = db.collection('posts');

	// GET all posts
	app.get('/api/posts', function(req, res){

		posts.find().sort({_id: -1}).toArray(function(err, results){
		
			if(err){
				res.json(err);
			}
			else{
				res.json(results);
			}

		});

	});

	//GET post by ID
	app.get('/api/post/:id', function(req, res){

		posts.find(objectId(req.params.id)).toArray(function(err, results){

			if(err){
				res.json(err);
			}
			else{
				res.json(results);
			}

		});

	});

	//Crate a post
	app.post('/api/post', function(req, res){

		var date = new Date();
		var timestamp = date.getTime();
		var _img_url = timestamp + '_' + req.files.file.originalFilename;
		var fileExtension = path.extname(req.files.file.originalFilename).toLowerCase();

		//Check for file extension
		if(fileExtension != '.jpg' && fileExtension != '.jpeg' && fileExtension != '.png'){
			res.status(400).json({error: 'Invalid file extension'});
			return;
		}

		var sourcePath = req.files.file.path;
		var destinationPath = './uploads/'+_img_url;

		var buffer = readChunk.sync(sourcePath, 0, 4100);
		var fileTypeBuffer = fileType(buffer);

		var s3 = new aws.S3();
		var fileName = _img_url;
		var mime = fileTypeBuffer.mime;

		var s3Params = {
		    Bucket: process.env.S3_BUCKET,
		    Key: fileName,
		    Expires: 60,
		    ContentType: mime,
		    ACL: 'public-read'
		};

		s3.getSignedUrl('putObject', s3Params, (err, data) => {
			if(err){
			    return res.status(500).json(err);
			} 
			var returnData = {
			    signedRequest: data,
			    fileName: _img_url
			};
			res.status(200).json(returnData);
			return;
		});

	});

	app.post('/api/post/save', function(req, res){

		var data = {
			img_url: req.body.fileName,
			title: req.body.title,
			author: req.body.user,
			author_avatar: req.body.avatar,
			likes: 0
		};

		posts.insert(data, function(err, results){

			if(err){
				res.status(500).json(err);
			}
			else{
				res.status(200).json(results);
			}

		});

	});

	//Insert a comment in a post
	app.put('/api/post/:id/comment', function(req, res){

		var _commentId = new objectId();

		posts.update(
			{ _id : objectId(req.params.id)},
			{$push : 	{
							comments : {
								id: _commentId,
								comment: req.body.comment,
								author: req.body.author
							}
						}
			},
			{},

			function(err, results){
				if(err){
					res.status(500).json(err);
				}
				else{
					res.status(200).json({id: _commentId});
				}
		});
	});

	//DELETE a comment by ID
	app.delete('/api/comment/:id', function(req, res){

		posts.update(
			{}, 
			{
				$pull : {
							comments : {id : objectId(req.params.id)}
						}
			},
			{
				multi : true
			},

			function(err, results){

				if(err){
					res.json(err);
				}
				else{
					res.json(results);
				}

			}
		);
	});

	//Like a post
	app.put('/api/post/:id/like', function(req, res){

		var post_id = req.params.id;
		var user_id = req.body.user_id;

		posts.update(
			{_id: objectId(post_id)},
			{
				$inc: {likes: 1},
				$push: 	{
							users_liked : {user_id : objectId(user_id)}
						}
			},
			{},

			function(err, results){
				
				if(err){
					res.json(err);
				}
				else{
					res.json(results);
				}
			}
		);

	});

	//Dislike a post
	app.put('/api/post/:id/dislike', function(req, res){

		var post_id = req.params.id;
		var user_id = req.body.user_id;
		
		posts.update(
			{_id: objectId(post_id)},
			{
				$inc: {likes: -1},
				$pull: 	{
							users_liked : {user_id : objectId(user_id)}
						}
			},
			{},

			function(err, results){
				
				if(err){
					res.json(err);
				}
				else{
					res.json(results);
				}
			}
		);

	});

});

//GET images
app.get('/images/:img', function(req, res){

	var img = req.params.img;

	fs.readFile('./uploads/'+img, function(err, data){

		if(err){
			res.status(400).json(err);
			return;
		}

		res.writeHead(200, {'content-type': 'image/jpg'});
		res.end(data);
	});

});