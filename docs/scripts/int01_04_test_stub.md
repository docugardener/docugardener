```markdown
### `list_users`

Returns a paginated list of users.

**Parameters:**

*   `limit` (int, optional): The maximum number of users to return. Defaults to 10.

**Returns:**

*   list[dict]: A list of user dictionaries.

**Example:**

```python
users = list_users(limit=5)
print(users)
```
```