import { Request, Response } from 'express';
import { ProfileService } from '../services/profileService.js';
import { AuthenticatedRequest } from '../middlewares/authMiddleware.js';

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
}
