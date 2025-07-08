const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const { Buffer } = require('buffer');
const { createCanvas, loadImage, ImageData } = require('canvas');
const tf = require('@tensorflow/tfjs-node');
const bodyPix = require('@tensorflow-models/body-pix');
const sharp = require('sharp');

const PORT = 3001;
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// Initialize BodyPix model
let net;
async function loadBodyPix() {
  console.log('Loading BodyPix model...');
  net = await bodyPix.load({
    architecture: 'MobileNetV1',
    outputStride: 16,
    multiplier: 0.75,
    quantBytes: 2
  });
  console.log('BodyPix model loaded');
}

// Load the model when the server starts
loadBodyPix().catch(console.error);

// Function to remove background using BodyPix
async function removeBackgroundWithBodyPix(imageBuffer) {
  try {
    // Convert buffer to tensor
    const imageTensor = tf.node.decodeImage(imageBuffer);
    
    // Get segmentation
    const segmentation = await net.segmentPerson(imageTensor, {
      flipHorizontal: false,
      internalResolution: 'high',
      segmentationThreshold: 0.7
    });

    // Create a mask from segmentation
    const mask = bodyPix.toMask(segmentation);
    const maskTensor = tf.tensor3d(
      new Uint8ClampedArray(mask.data),
      [mask.height, mask.width, 4]
    );

    // Apply mask to original image
    const maskedImage = tf.mul(imageTensor.toFloat(), maskTensor.toFloat().div(255.0));
    
    // Convert back to buffer
    const result = await tf.node.encodePng(tf.cast(maskedImage, 'int32'));
    
    // Cleanup
    tf.dispose([imageTensor, maskTensor, maskedImage]);
    
    return result;
  } catch (error) {
    console.error('Error in removeBackgroundWithBodyPix:', error);
    throw error;
  }
}

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Simple multipart form data parser
function parseMultipartFormData(body, boundary) {
  const parts = [];
  const boundaryBuffer = Buffer.from(`--${boundary}`);
  const boundaryEndBuffer = Buffer.from(`--${boundary}--`);
  
  let currentPart = null;
  let position = 0;
  
  // Find all boundaries
  while (position < body.length) {
    const boundaryIndex = body.indexOf(boundaryBuffer, position);
    if (boundaryIndex === -1) break;
    
    // If we have a current part, save it
    if (currentPart) {
      currentPart.data = body.slice(currentPart.start, boundaryIndex - 2); // -2 for CRLF
      parts.push(currentPart);
    }
    
    // Find the end of the headers
    const headersEnd = body.indexOf('\r\n\r\n', boundaryIndex);
    if (headersEnd === -1) break;
    
    // Parse headers
    const headersText = body.slice(boundaryIndex + boundaryBuffer.length + 2, headersEnd).toString();
    const headers = {};
    headersText.split('\r\n').forEach(line => {
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        const key = line.slice(0, colonIndex).trim().toLowerCase();
        const value = line.slice(colonIndex + 1).trim();
        headers[key] = value;
      }
    });
    
    // Start a new part
    currentPart = {
      headers,
      start: headersEnd + 4, // Skip CRLFCRLF
      data: null
    };
    
    position = headersEnd + 4;
  }
  
  return parts;
}

const server = http.createServer(async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Handle file upload
  if (req.method === 'POST' && req.url === '/api/upload') {
    const contentType = req.headers['content-type'] || '';
    const boundaryMatch = contentType.match(/boundary=([^;]+)/i);
    
    if (!boundaryMatch) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid content type. Expected multipart/form-data' }));
      return;
    }
    
    const boundary = boundaryMatch[1];
    let body = Buffer.alloc(0);
    
    req.on('data', chunk => {
      body = Buffer.concat([body, chunk]);
      
      // Prevent large file uploads
      if (body.length > MAX_FILE_SIZE) {
        req.destroy();
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'File size too large. Maximum 10MB allowed.' }));
      }
    });
    
    req.on('end', async () => {
      try {
        const parts = parseMultipartFormData(body, boundary);
        const filePart = parts.find(part => 
          part.headers['content-disposition'] && 
          part.headers['content-disposition'].includes('filename=')
        );
        
        if (!filePart || !filePart.data) {
          throw new Error('No file was uploaded');
        }
        
        // Get the original filename
        const filenameMatch = filePart.headers['content-disposition'].match(/filename="([^"]+)"/i);
        const originalFilename = filenameMatch ? filenameMatch[1] : 'uploaded-file';
        const fileExt = path.extname(originalFilename) || '.bin';
        
        // Generate unique filenames
        const timestamp = Date.now();
        const fileName = `image-${timestamp}${fileExt}`;
        const filePath = path.join(UPLOAD_DIR, fileName);
        const resultPath = path.join(UPLOAD_DIR, `result-${fileName}`);
        
        // Save the uploaded file
        fs.writeFileSync(filePath, filePart.data);
        
        // Process the image with background removal
        try {
            console.log('Processing image with background removal...');
            const imageBuffer = fs.readFileSync(filePath);
            
            // First, resize the image if it's too large for processing
            const resizedBuffer = await sharp(imageBuffer)
                .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
                .toBuffer();
            
            // Remove background using BodyPix
            const processedBuffer = await removeBackgroundWithBodyPix(resizedBuffer);
            
            // Save the processed image
            await sharp(processedBuffer)
                .trim()
                .toFile(resultPath);
            
            console.log('Background removed successfully');
        } catch (error) {
            console.error('Background removal error:', error);
            // Fallback to original image if processing fails
            fs.copyFileSync(filePath, resultPath);
            console.log('Fell back to original image due to processing error');
        }
        
        // Send success response
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          original: `/uploads/${fileName}`,
          result: `/uploads/result-${fileName}`
        }));
      } catch (error) {
        console.error('Error processing upload:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          success: false,
          error: error.message || 'Error processing file' 
        }));
      }
    });
    
    req.on('error', (error) => {
      console.error('Upload error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        success: false,
        error: 'Error receiving file' 
      }));
    });
  }
  // Serve uploaded files
  else if (req.method === 'GET' && req.url.startsWith('/uploads/')) {
    const filePath = path.join(__dirname, req.url);
    
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('File not found');
        return;
      }
      
      // Set appropriate content type
      const ext = path.extname(filePath).toLowerCase();
      const contentType = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif'
      }[ext] || 'application/octet-stream';
      
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    });
  }
    // Default response for root path
  else if (req.url === '/' && req.method === 'GET') {
    res.writeHead(200, { 
      'Content-Type': 'text/plain',
      'Access-Control-Allow-Origin': '*'
    });
    res.end('NEXUS AI Image Processing API');
  }
  // Handle 404 for all other routes
  else {
    res.writeHead(404, { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify({ 
      success: false,
      error: 'Route not found' 
    }));
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log('Upload endpoint: POST http://localhost:3001/api/upload');
});
