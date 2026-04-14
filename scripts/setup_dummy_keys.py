from src.worker.context import SessionLocal
from src.storage.sql_models import Tenant
from src.security.encryption import encrypt_credential

def setup_dummy():
    session = SessionLocal()
    tenant = session.query(Tenant).first()
    if tenant:
        print(f"Update keys for {tenant.name}")
        # Need "appId" and "privateKey"
        tenant.appId = "12345"
        # Helper to encrypt
        tenant.privateKey = encrypt_credential("dummy-key")
        session.commit()
        print("Updated with encrypted dummy keys")
    session.close()

if __name__ == "__main__":
    setup_dummy()
