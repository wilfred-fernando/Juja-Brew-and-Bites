{
  "type": "object",
  "properties": {
    "name": {
      "type": "string"
    },
    "description": {
      "type": "string"
    },
    "price": {
      "type": "number"
    },
    "category": {
      "type": "string",
      "enum": [
        "Signature",
        "Cookies",
        "Pastries",
        "Coffee",
        "Non-Coffee",
        "Frappe",
        "Milk Tea",
        "Chicken",
        "Rice Meal",
        "Rice in a Box",
        "Pasta",
        "Waffles",
        "Snacks",
        "All Day Breakfast",
        "Group Tray"
      ]
    },
    "image_url": {
      "type": "string"
    },
    "is_available": {
      "type": "boolean",
      "default": true
    },
    "is_featured": {
      "type": "boolean",
      "default": false
    },
    "option_groups": {
      "type": "array",
      "description": "Groups of options customers can choose from (e.g., Size, Flavor, Add-ons)",
      "items": {
        "type": "object",
        "properties": {
          "name": {
            "type": "string"
          },
          "required": {
            "type": "boolean"
          },
          "multi_select": {
            "type": "boolean"
          },
          "options": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "name": {
                  "type": "string"
                },
                "price_add": {
                  "type": "number",
                  "default": 0
                }
              }
            }
          }
        }
      }
    }
  },
  "required": [
    "name",
    "price",
    "category"
  ],
  "name": "MenuItem"
}