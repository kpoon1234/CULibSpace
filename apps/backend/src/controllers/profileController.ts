import { Request, Response } from 'express';
import { ProfileService } from '../services/profileService.js';
import { MinioService } from '../services/minioService.js';
import { AuthenticatedRequest } from '../middlewares/authMiddleware.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class ProfileController {
  static async updateProfile(req: Request, res: Response): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      if (!authReq.user?.uid) {
        res.status(401).json({ success: false, error: 'Unauthorized: User session required' });
        return;
      }

      const { firstname, lastname, phone, imageUrl } = req.body;

      const result = await ProfileService.updateProfile(authReq.user.uid, {
        firstname,
        lastname,
        phone,
        imageUrl,
      });

      res.status(200).json({ success: true, message: 'Profile updated successfully', ...result });
    } catch (err: any) {
      const status = err.status || 500;
      res.status(status).json({ success: false, error: err.message || 'Internal server error' });
    }
  }

  static async updateProfileImage(req: Request, res: Response): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      if (!authReq.user?.uid) {
        res.status(401).json({ success: false, error: 'Unauthorized: User session required' });
        return;
      }

      const { imageUrl } = req.body;

      const result = await ProfileService.updateProfileImage(authReq.user.uid, imageUrl);

      res
        .status(200)
        .json({ success: true, message: 'Profile image updated successfully', ...result });
    } catch (err: any) {
      const status = err.status || 500;
      res.status(status).json({ success: false, error: err.message || 'Internal server error' });
    }
  }

  static async uploadProfileImage(req: Request, res: Response): Promise<void> {
    try {
      const authReq = req as AuthenticatedRequest;
      if (!authReq.user?.uid) {
        res.status(401).json({ success: false, error: 'Unauthorized: User session required' });
        return;
      }

      if (!req.file) {
        res.status(400).json({ success: false, error: 'No image file provided' });
        return;
      }

      // Check existing user to clean up previous MinIO avatar if any
      const currentUser = await prisma.user.findUnique({
        where: { uid: authReq.user.uid },
        select: { imageUrl: true },
      });

      // Upload new avatar to MinIO
      const publicUrl = await MinioService.uploadAvatar(req.file, authReq.user.uid);

      // Clean up previous avatar if it was stored in MinIO
      if (currentUser?.imageUrl) {
        await MinioService.deleteAvatar(currentUser.imageUrl);
      }

      // Update image URL in DB
      const result = await ProfileService.updateProfileImage(authReq.user.uid, publicUrl);

      res.status(200).json({
        success: true,
        message: 'Profile image uploaded successfully',
        ...result,
      });
    } catch (err: any) {
      const status = err.status || 500;
      res.status(status).json({ success: false, error: err.message || 'Internal server error' });
    }
  }
}
