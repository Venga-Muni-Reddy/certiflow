import jwt from 'jsonwebtoken';
import { prisma } from '../db/prisma.js';
import { config } from '../config/env.js';
import { UserRole, DemoUserDTO, AuthResponseDTO } from '@certiflow/shared';
import { SEED_DATA } from '../../prisma/seed.js';

export class AuthService {
  /**
   * List available demo personas
   */
  public async getDemoUsers(): Promise<DemoUserDTO[]> {
    try {
      const users = await prisma.user.findMany({
        include: {
          district: true,
          trainingCentre: true
        },
        orderBy: { createdAt: 'asc' }
      });

      if (users && users.length > 0) {
        return users.map((u) => {
          let scopeLabel = 'Global / State Scope';
          if (u.role === UserRole.TRAINING_CENTRE && u.trainingCentre) {
            scopeLabel = `${u.trainingCentre.name} (${u.trainingCentre.code})`;
          } else if (u.role === UserRole.DISTRICT_OFFICER && u.district) {
            scopeLabel = `${u.district.name} (${u.district.code})`;
          } else if (u.role === UserRole.QUALITY_TEAM) {
            scopeLabel = 'State Quality Assurance (Batches >50)';
          } else if (u.role === UserRole.STATE_OFFICE) {
            scopeLabel = 'State Directorate (Final Authority)';
          }

          return {
            id: u.id,
            name: u.name,
            role: u.role as unknown as UserRole,
            scopeLabel,
            districtId: u.districtId,
            trainingCentreId: u.trainingCentreId
          };
        });
      }
    } catch {
      // Fallback to static seed personas if database connection is pending
    }

    return Object.values(SEED_DATA.users).map((u) => {
      let scopeLabel = 'Global / State Scope';
      if (u.role === UserRole.TRAINING_CENTRE) scopeLabel = 'Nirmaan Skill Academy (HYD)';
      else if (u.role === UserRole.DISTRICT_OFFICER) scopeLabel = 'Hyderabad Metro (HYD)';
      else if (u.role === UserRole.QUALITY_TEAM) scopeLabel = 'State Quality Assurance (Batches >50)';
      else if (u.role === UserRole.STATE_OFFICE) scopeLabel = 'State Directorate (Final Authority)';
      return {
        id: u.id,
        name: u.name,
        role: u.role as unknown as UserRole,
        scopeLabel,
        districtId: u.districtId || null,
        trainingCentreId: u.trainingCentreId || null
      };
    });
  }

  /**
   * Switch active demo persona and issue signed JWT
   */
  public async switchDemoUser(userId: string): Promise<AuthResponseDTO> {
    let user: any = null;
    try {
      user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          district: true,
          trainingCentre: true
        }
      });
    } catch {
      // Fallback
    }

    if (!user) {
      const found = Object.values(SEED_DATA.users).find((u) => u.id === userId);
      if (found) {
        user = found;
      }
    }

    if (!user) {
      throw new Error(`Demo user with ID '${userId}' not found.`);
    }

    const payload = {
      sub: user.id,
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      districtId: user.districtId,
      trainingCentreId: user.trainingCentreId
    };

    const token = jwt.sign(payload, config.jwtSecret, { expiresIn: '7d' });

    return {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role as unknown as UserRole,
        districtId: user.districtId,
        trainingCentreId: user.trainingCentreId
      }
    };
  }
}

export const authService = new AuthService();
