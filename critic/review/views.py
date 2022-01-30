from django.http import HttpResponse, JsonResponse
from django.shortcuts import render
from django.contrib.auth.decorators import login_required

from .utils import get_omdb_info, get_omdb_search, convert_omdb_to_review

CATEGORIES = {
    'movie': {
        'search': get_omdb_search,
        'info': get_omdb_info,
        'convert': convert_omdb_to_review,
    }
}

INVALID_USER_RESPONSE = {"Response": "False", "Error": "User not authenticated."}
INVALID_CATEGORY_RESPONSE = {"Response": "False", "Error": "Invalid category."}
NOT_OK_RESPONSE = {"Response": "False", "Error": "Bad reponse from API."}

def view_reviews(request):
    return render(request, 'review/view_reviews.html')

@login_required
def add_review(request):
    return render(request, 'review/add_review.html')

def search_review_item(request, category, search_term):
    if not request.user.is_authenticated:
        return JsonResponse(str(INVALID_USER_RESPONSE))
    if category not in CATEGORIES:
        return JsonResponse(str(INVALID_CATEGORY_RESPONSE))
    util_funcs = CATEGORIES[category]
    json_data = util_funcs['search'](search_term)
    item_data = util_funcs['convert'](json_data)
    return JsonResponse(item_data)

def get_review_item_info(request, category, item_id):
    if not request.user.is_authenticated:
        return JsonResponse(str(INVALID_USER_RESPONSE))
    if category not in CATEGORIES:
        return JsonResponse(str(INVALID_CATEGORY_RESPONSE))
    util_funcs = CATEGORIES[category]
    json_data = util_funcs['info'](item_id)
    item_data = util_funcs['convert'](json_data)
    return JsonResponse(item_data)
