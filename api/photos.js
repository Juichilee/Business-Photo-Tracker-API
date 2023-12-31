/*
 * API sub-router for photos collection endpoints.
 */

const { Router } = require('express');
const router = Router();

const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs/promises');

const queue = 'photos';

const {
  getImageInfoById,
  saveImageInfo,
  saveImageFile,
  getDownloadStreamByFilename
} = require('../models/image');

const { getChannel } = require('../lib/rabbitmq');

const fileTypes = {
  'image/jpeg' : 'jpg',
  'image/png' : 'png'
};

const upload = multer({ 
  storage: multer.diskStorage({
    destination: `${__dirname}/../uploads`,
    filename: function(req, file, callback){
      const ext = fileTypes[file.mimetype]
      const filename = crypto.pseudoRandomBytes(16).toString('hex')
      callback(null, `${filename}.${ext}`) 
    }
  }),
  fileFilter: function (req, file, callback){
    callback(null, !!fileTypes[file.mimetype])
  }
});

const { validateAgainstSchema } = require('../lib/validation');
const {
  PhotoSchema,
  insertNewPhoto,
  getPhotoById
} = require('../models/photo');

/*
 * POST /photos - Route to upload and store an image (jpg/png) and its metadata inside GridFS photos collection
 */
router.post('/', upload.single('image'), async function (req, res, next) {
  console.log("== req.file:", req.file);
  console.log("== req.body:", req.body);
  if (req.file && req.body && req.body.businessId && req.body.userId) {
    const image = {
      userId: req.body.userId,
      businessId: req.body.businessId,
      caption: req.body.caption,
      path: req.file.path,
      filename: req.file.filename,
      mimetype: req.file.mimetype
    };
    const id = await saveImageFile(image);
    console.log("ID: ", id);

    const channel = getChannel();
    await channel.assertQueue('photos');
    filenamestring = req.file.filename;
    console.log("FILENAMESTRING: ", filenamestring);
    channel.sendToQueue(queue, Buffer.from(filenamestring));

    res.status(201).send({
      id: id,
      links: {
        photo: `/photos/${id}`,
        business: `/businesses/${req.body.businessId}`
      }
    });
  } else {
    res.status(400).send({
      err: 'Request body needs an "image", "businessId", and "caption'
    });
  }
})

/*
 * GET /photos/:id - Route to retrieve a photo's metadata and media HATEOS links for downloading the photo or the generated thumbnail
 */
router.get('/:id', async (req, res, next) => {
  try {
    const image = await getImageInfoById(req.params.id);
    if (image) {
      const resBody = {
        _id: image._id,
        url: `/media/photos/${image.filename}`,
        thumburl: `/media/thumbs/${image.filename}`,
        thumbId: image.metadata.thumbId,
        mimetype: image.metadata.mimetype,
        businessId: image.metadata.businessId,
        caption: image.metadata.caption
      };
      res.status(200).send(resBody);
    } else {
      next();
    }
  } catch (err) {
    next(err);
  }
});

module.exports = router;
