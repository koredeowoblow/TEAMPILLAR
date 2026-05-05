import cloudinary from "../config/cloudinary.js";

class CloudinaryService {
  /**
   * Upload a file buffer to Cloudinary.
   * @param {Buffer} fileBuffer - The file buffer from multer memory storage
   * @param {object} options - Upload options
   * @param {string} [options.folder] - Cloudinary folder name
   * @param {string} [options.resourceType] - Resource type (image, video, raw)
   * @returns {Promise<{url: string, publicId: string}>}
   */
  static async upload(
    fileBuffer,
    { folder = "Team_Pillar", resourceType = "image" } = {},
  ) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error("Cloudinary upload timed out"));
      }, 15000);

      const stream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: resourceType,
          transformation: [{ quality: "auto", fetch_format: "auto" }],
        },
        (error, result) => {
          clearTimeout(timeoutId);
          if (error) return reject(error);
          resolve({
            url: result.secure_url,
            publicId: result.public_id,
          });
        },
      );
      stream.end(fileBuffer);
    });
  }

  /**
   * Delete a file from Cloudinary by its public ID.
   * @param {string} publicId - The Cloudinary public ID
   * @returns {Promise<object>}
   */
  static async delete(publicId) {
    return cloudinary.uploader.destroy(publicId);
  }

  /**
   * Extract the public ID from a Cloudinary URL.
   * e.g. "https://res.cloudinary.com/xxx/image/upload/v123/Team_Pillar/profiles/abc.jpg"
   *   → "Team_Pillar/profiles/abc"
   * Returns null for non-Cloudinary URLs.
   */
  static extractPublicId(url) {
    if (!url || !url.includes("res.cloudinary.com")) return null;
    const parts = url.split("/upload/");
    if (parts.length < 2) return null;
    // Remove version prefix (v1234567890/) and file extension
    const afterUpload = parts[1].replace(/^v\d+\//, "");
    return afterUpload.replace(/\.[^.]+$/, "");
  }

  /**
   * Delete old Cloudinary image if it exists. Safe to call with any URL.
   */
  static async deleteIfCloudinary(url) {
    const publicId = CloudinaryService.extractPublicId(url);
    if (publicId) {
      await CloudinaryService.delete(publicId);
    }
  }
}

export default CloudinaryService;
