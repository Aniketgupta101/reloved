export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          auth_user_id: string
          role: string
          first_name: string | null
          last_name: string | null
          phone: string | null
          email: string | null
          active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          auth_user_id: string
          role?: string
          first_name?: string | null
          last_name?: string | null
          phone?: string | null
          email?: string | null
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          role?: string
          first_name?: string | null
          last_name?: string | null
          phone?: string | null
          email?: string | null
          active?: boolean
          updated_at?: string
        }
      }
      donation_submissions: {
        Row: {
          id: string
          reference: string
          donor_first_name: string
          donor_last_name: string | null
          phone: string
          email: string | null
          locality: string
          preferred_contact_method: string
          recognition_preference: string
          status: string
          internal_notes: string | null
          submitted_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          reference: string
          donor_first_name: string
          donor_last_name?: string | null
          phone: string
          email?: string | null
          locality: string
          preferred_contact_method?: string
          recognition_preference?: string
          status?: string
          internal_notes?: string | null
          submitted_at?: string
          updated_at?: string
        }
        Update: {
          status?: string
          internal_notes?: string | null
          updated_at?: string
        }
      }
      items: {
        Row: {
          id: string
          submission_id: string
          slug: string
          category: string
          title: string
          description: string
          quantity: number
          approved_quantity: number | null
          brand: string | null
          size: string | null
          dimensions: string | null
          condition: string
          approximate_age: string | null
          locality: string
          status: string
          public_status: string
          public_visibility: boolean
          rejection_reason: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          submission_id: string
          slug: string
          category: string
          title: string
          description: string
          quantity?: number
          approved_quantity?: number | null
          brand?: string | null
          size?: string | null
          dimensions?: string | null
          condition: string
          approximate_age?: string | null
          locality: string
          status?: string
          public_status?: string
          public_visibility?: boolean
          rejection_reason?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          category?: string
          title?: string
          description?: string
          quantity?: number
          approved_quantity?: number | null
          brand?: string | null
          size?: string | null
          dimensions?: string | null
          condition?: string
          approximate_age?: string | null
          locality?: string
          status?: string
          public_status?: string
          public_visibility?: boolean
          rejection_reason?: string | null
          updated_at?: string
        }
      }
      item_images: {
        Row: {
          id: string
          item_id: string
          storage_path: string
          image_type: string
          sort_order: number
          created_at: string
        }
        Insert: {
          id?: string
          item_id: string
          storage_path: string
          image_type?: string
          sort_order?: number
          created_at?: string
        }
        Update: {
          image_type?: string
          sort_order?: number
        }
      }
      partner_applications: {
        Row: {
          id: string
          organisation_name: string
          organisation_type: string
          registration_status: string
          registration_number: string | null
          website: string | null
          contact_name: string
          contact_role: string
          phone: string
          email: string
          locality: string
          beneficiary_profile: string
          estimated_beneficiaries: number
          required_categories: string[]
          sizes_or_age_groups: string | null
          estimated_quantities: number
          urgency: string
          coordination_capability: string
          completion_confirmation_capability: string
          safeguarding_notes: string | null
          status: string
          verification_notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          organisation_name: string
          organisation_type: string
          registration_status: string
          registration_number?: string | null
          website?: string | null
          contact_name: string
          contact_role: string
          phone: string
          email: string
          locality: string
          beneficiary_profile: string
          estimated_beneficiaries: number
          required_categories: string[]
          sizes_or_age_groups?: string | null
          estimated_quantities: number
          urgency: string
          coordination_capability: string
          completion_confirmation_capability: string
          safeguarding_notes?: string | null
          status?: string
          verification_notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          status?: string
          verification_notes?: string | null
          updated_at?: string
        }
      }
      partners: {
        Row: {
          id: string
          application_id: string
          organisation_name: string
          organisation_type: string
          primary_contact: string
          phone: string
          email: string
          locality: string
          verification_status: string
          public_visibility: boolean
          active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          application_id: string
          organisation_name: string
          organisation_type: string
          primary_contact: string
          phone: string
          email: string
          locality: string
          verification_status?: string
          public_visibility?: boolean
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          organisation_name?: string
          primary_contact?: string
          phone?: string
          email?: string
          locality?: string
          verification_status?: string
          public_visibility?: boolean
          active?: boolean
          updated_at?: string
        }
      }
      partner_needs: {
        Row: {
          id: string
          partner_id: string
          category: string
          item_type: string
          quantity_required: number
          quantity_fulfilled: number
          size: string | null
          age_group: string | null
          urgency: string
          notes: string | null
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          partner_id: string
          category: string
          item_type: string
          quantity_required: number
          quantity_fulfilled?: number
          size?: string | null
          age_group?: string | null
          urgency: string
          notes?: string | null
          status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          quantity_required?: number
          quantity_fulfilled?: number
          status?: string
          updated_at?: string
        }
      }
      allocations: {
        Row: {
          id: string
          reference: string
          partner_id: string
          status: string
          operational_notes: string | null
          confirmed_at: string | null
          completed_at: string | null
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          reference: string
          partner_id: string
          status?: string
          operational_notes?: string | null
          confirmed_at?: string | null
          completed_at?: string | null
          created_by: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          status?: string
          operational_notes?: string | null
          confirmed_at?: string | null
          completed_at?: string | null
          updated_at?: string
        }
      }
      allocation_items: {
        Row: {
          id: string
          allocation_id: string
          item_id: string
          allocated_quantity: number
          completed_quantity: number
          created_at: string
        }
        Insert: {
          id?: string
          allocation_id: string
          item_id: string
          allocated_quantity: number
          completed_quantity?: number
          created_at?: string
        }
        Update: {
          completed_quantity?: number
        }
      }
      evidence_records: {
        Row: {
          id: string
          allocation_id: string
          storage_path: string
          evidence_type: string
          consent_status: string
          public_visibility: boolean
          minor_involved: boolean
          guardian_or_institution_consent: boolean
          completion_note: string | null
          captured_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          allocation_id: string
          storage_path: string
          evidence_type: string
          consent_status: string
          public_visibility?: boolean
          minor_involved?: boolean
          guardian_or_institution_consent?: boolean
          completion_note?: string | null
          captured_at?: string | null
          created_at?: string
        }
        Update: {
          consent_status?: string
          public_visibility?: boolean
          guardian_or_institution_consent?: boolean
          completion_note?: string | null
        }
      }
      audit_events: {
        Row: {
          id: string
          actor_id: string
          entity_type: string
          entity_id: string
          action: string
          previous_state: Json | null
          new_state: Json | null
          note: string | null
          created_at: string
        }
        Insert: {
          id?: string
          actor_id: string
          entity_type: string
          entity_id: string
          action: string
          previous_state?: Json | null
          new_state?: Json | null
          note?: string | null
          created_at?: string
        }
        Update: never
      }
      app_settings: {
        Row: {
          id: string
          key: string
          value: Json
          updated_at: string
        }
        Insert: {
          id?: string
          key: string
          value: Json
          updated_at?: string
        }
        Update: {
          value?: Json
          updated_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
