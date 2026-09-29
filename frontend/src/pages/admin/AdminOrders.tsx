import { useSearchParams } from "react-router-dom";
import { AdminOperations } from "@/components/admin/AdminOperations";
import { InventoryClaimFocusPanel } from "@/components/admin/InventoryClaimFocusPanel";
export function AdminOrders() {
  const [params] = useSearchParams();
  const id = params.get("claimId");
  return id ? (
    <InventoryClaimFocusPanel key={id} id={id} kind="delivery" />
  ) : (
    <AdminOperations kind="deliveries" />
  );
}
