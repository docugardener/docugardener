from sqlalchemy import text
from src.worker.context import SessionLocal

def inspect_users():
    session = SessionLocal()
    try:
        # Raw SQL to fetch users
        result = session.execute(text('SELECT id, email, name FROM "User"'))
        users = result.fetchall()
        
        print(f"Found {len(users)} users:")
        for u in users:
            print(f"\nUser: {u.email} (ID: {u.id}, Name: {u.name})")
            
            # Fetch accounts for this user
            acc_result = session.execute(text('SELECT provider, "providerAccountId" FROM "Account" WHERE "userId" = :uid'), {"uid": u.id})
            accounts = acc_result.fetchall()
            
            if accounts:
                for acc in accounts:
                    print(f"  - Linked Account: {acc.provider} (ID: {acc.providerAccountId})")
            else:
                print("  - No linked accounts")
                
    except Exception as e:
        print(f"Error: {e}")
    finally:
        session.close()

if __name__ == "__main__":
    inspect_users()
