"use strict"

let mongo_user = "openfaas"
let mongo_pass = "VAoOfJLVwX5W86Im"
let dbname = "files"
let collname = "jpg"

const MongoClient = require('mongodb').MongoClient;
var ExifImage = require('exif').ExifImage;
var Minio = require('minio');

var clientsDB;  // Cached connection-pool for further requests.

module.exports = (event, context) => {
    prepareDB()
        .then((database) => {

            var name = event.body.Records[0].s3.object.key;
            var exifresult;

            console.log(name)

            var minioClient = new Minio.Client({
                endPoint: '35.199.100.179',
                port: 9000,
                useSSL: false,
                accessKey: 'minio',
                secretKey: 'minio123'
            });

            minioClient.fGetObject('files', name, name, (err) => {
                if (err) {
                    console.log(err);
                    return context.fail(err.toString())
                }
                try {
                    new ExifImage({ image: name }, function (error, exifData) {
                        if (error){
                            exifresult = 'Error: ' + error.message
                            console.log(exifresult)
                        }
                        else {
                            // Do something with your data!
                            var height, width, pixels = 0
                            height = exifData.exif.ExifImageHeight
                            width = exifData.exif.ExifImageWidth
                            pixels = height*width

                            const record = {
                                _id: event.body.Key,
                                height: height,
                                width: width,
                                pixels: pixels + 'px',
                                exifdata: exifData.exif
                            }
                            console.log(record)
                            database.collection(collname).insertOne(record, (insertErr) => {
                                if (insertErr) {
                                    if(insertErr.toString().includes('MongoError: E11000')){
                                        database.collection(collname).updateOne(
                                            { _id: record._id },
                                            { $set: {
                                                height: height,
                                                width: width,
                                                pixels: pixels + 'px',
                                                exifdata: exifData.exif
                                            },
                                              $currentDate: { lastModified: true } })
                                          .then(function(result) {
                                                console.log('Updated')
                                          })    
                                    } else
                                    return context.fail(insertErr.toString());
                                }

                                context
                                    .status(200)
                                    .succeed(record);

                            });
                        }

                    });
                } catch (error) {
                    console.log(error)
                    return context.fail(error.toString())
                }
            })
        })
        .catch(err => {
            context.fail(err.toString());
        });
}

const prepareDB = () => {

    const uri = "mongodb+srv://" + mongo_user + ":" + mongo_pass + "@cluster0-uc6in.gcp.mongodb.net/test?retryWrites=true&w=majority";

    const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

    return new Promise((resolve, reject) => {
        if (clientsDB) {
            console.error("DB already connected.");
            return resolve(clientsDB);
        }

        console.error("DB connecting");

        client.connect((err, client) => {
            if (err) {
                return reject(err)
            }

            clientsDB = client.db(dbname);
            return resolve(clientsDB)
        });
    });
}
