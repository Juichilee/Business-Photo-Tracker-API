const amqp = require('amqplib');
const jimp = require('jimp');
const fs = require('fs');
const path = require('path');

const { ObjectId, GridFSBucket } = require('mongodb');

const queue = 'photos';

const rabbitmqHost = process.env.RABBITMQ_HOST || 'rabbitmq';
const rabbitmqUrl = `amqp://${rabbitmqHost}`;

const { connectToDb, getDbReference } = require('./lib/mongo');
const { getChannel } = require('./lib/rabbitmq');
const { getDownloadStreamByFilename } = require('./models/image');

/*
 * Before running this consumer, the api, rabbitmq, and the database must be running beforehand. 
 * Then, run the consumer within the api docker container by entering its terminal and running
 * the command `node consumer.js` to have it consume objects queued up by rabbitmq.
 */

async function main() {

    // Establishing connection to rabbitmq container
    console.log("URL: ", rabbitmqUrl);
    connection = await amqp.connect(rabbitmqUrl);
    console.log("CONNECTED");
    channel = await connection.createChannel();
    await channel.assertQueue('photos');
    
    channel.consume('photos', function(msg){
        if(msg){
            fileName = msg.content.toString();

            console.log(fileName);
            console.log("Completed Download");

            // jimp is used to read an image and generate a modified version of it
            jimp.read(`${__dirname}/uploads/${fileName}`)
            .then(lenna => {
                return lenna
                .resize(100, 100)
                .write(`${__dirname}/uploads/modifiedtemp.jpg`, () => {
                    return new Promise(function (resolve, reject) {
                        const db = getDbReference();
                        const thumbsbucket = new GridFSBucket(db, { bucketName: 'thumbs' });

                        const metadata = {
                          filename: fileName
                        }
                    
                        const uploadStream = thumbsbucket.openUploadStream(fileName, {
                          metadata: metadata
                        });
                    
                        fs.createReadStream(`${__dirname}/uploads/modifiedtemp.jpg`).pipe(uploadStream)
                        .on('error', function (err) {
                            reject(err);
                        })
                        .on('finish', async function (result) {
                            const collection = db.collection('photos.files');
                            await collection.updateOne(
                                { filename: fileName },
                                { $set: { "metadata.thumbId": result._id }}
                            );
                            resolve(result._id);
                        })
                    })
                }); // save
            })
            .catch(err => {
                console.error(err);
            });
            console.log("COMPLETED RESIZE");
        }
        channel.ack(msg);
    })
}

connectToDb(async () => {
    await main()    
});

