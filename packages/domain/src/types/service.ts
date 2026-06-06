export interface ServiceCategory {
  id: string;
  professional_id: string;
  name: string;
  description: string | null;
  color: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Service {
  id: string;
  professional_id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  duration_minutes: number;
  price: number;
  is_active: boolean;
  is_public: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CreateServiceInput {
  name: string;
  durationMinutes?: number;
  price?: number;
  categoryId?: string | null;
  description?: string | null;
}

export interface UpdateServiceInput {
  serviceId: string;
  name: string;
  durationMinutes: number;
  price: number;
  categoryId?: string | null;
  description?: string | null;
  isPublic?: boolean;
}

export interface ServiceMutationOutput {
  service_id: string;
  service: Service;
}

export interface DeactivateServiceOutput {
  service_id: string;
  deactivated: boolean;
}
