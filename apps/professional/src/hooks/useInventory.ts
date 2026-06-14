import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InventoryOverview } from "@iaprafaturar/domain";
import { supabase } from "@/lib/supabase";
import { crmKeys } from "./queryKeys";

export function useInventory(professionalId: string | null) {
  const queryClient = useQueryClient();
  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: crmKeys.inventory(professionalId) }),
      queryClient.invalidateQueries({ queryKey: crmKeys.financeSettings(professionalId) }),
    ]);
  };

  const query = useQuery({
    queryKey: crmKeys.inventory(professionalId),
    enabled: Boolean(professionalId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_inventory_overview");
      if (error) throw error;
      return data as InventoryOverview;
    },
  });

  const saveProduct = useMutation({
    mutationFn: async (input: { productId?: string | null; name: string; sku?: string | null; unitPrice: number; initialStock?: number; minStock: number; isActive?: boolean }) => {
      const { data, error } = await supabase.rpc("upsert_product", {
        p_product_id: input.productId ?? null,
        p_name: input.name,
        p_sku: input.sku ?? null,
        p_unit_price: input.unitPrice,
        p_stock_quantity: input.initialStock ?? 0,
        p_min_stock: input.minStock,
        p_is_active: input.isActive ?? true,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });

  const adjustStock = useMutation({
    mutationFn: async (input: { productId: string; quantityChange: number; note?: string | null }) => {
      const { data, error } = await supabase.rpc("adjust_product_stock", {
        p_product_id: input.productId,
        p_quantity_change: input.quantityChange,
        p_note: input.note ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });

  const saveBatch = useMutation({
    mutationFn: async (input: { batchId?: string | null; productId: string; lotCode: string; quantity: number; expiresAt?: string | null }) => {
      const { data, error } = await supabase.rpc("upsert_product_batch", {
        p_batch_id: input.batchId ?? null,
        p_product_id: input.productId,
        p_lot_code: input.lotCode,
        p_quantity: input.quantity,
        p_expires_at: input.expiresAt ?? null,
        p_is_active: true,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });

  return {
    ...query,
    saveProduct: saveProduct.mutateAsync,
    adjustStock: adjustStock.mutateAsync,
    saveBatch: saveBatch.mutateAsync,
    isSaving: saveProduct.isPending || adjustStock.isPending || saveBatch.isPending,
  };
}
