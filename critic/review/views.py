from django.http import HttpResponse, HttpResponseRedirect, JsonResponse
from django.shortcuts import render, redirect
from django.contrib.auth.decorators import login_required

from .forms import ReviewForm

from . import utils
from .models import ReviewItem, Review

CATEGORIES = {
    'movie': {
        'search': utils.get_omdb_search,
        'info': utils.get_omdb_info,
        'convert': utils.convert_omdb_to_review,
    },
    'game': {
        'search': utils.get_rawg_search,
        'info': utils.get_rawg_info,
        'convert': utils.convert_rawg_to_review,
    },
}

INVALID_USER_RESPONSE = {"Response": "False", "Error": "User not authenticated."}
INVALID_CATEGORY_RESPONSE = {"Response": "False", "Error": "Invalid category."}
NOT_OK_RESPONSE = {"Response": "False", "Error": "Bad reponse from API."}

def view_reviews(request):
    return render(request, 'review/view_reviews.html')

@login_required()
def add_review(request):
    if request.method == 'POST':
        form = ReviewForm(request.POST)
        if form.is_valid():
            if request.user.is_authenticated:
                try:
                    form_data = form.cleaned_data
                    review_item = ReviewItem.objects.get(item_id=form_data['item_id'])
                    user = request.user
                    review_data = form_data['review']
                    rating = form_data['rating']
                    review_obj = Review(user=user, review_item=review_item, review_rating=rating, review_data=review_data)
                    review_obj.save()
                    return HttpResponseRedirect('/add')
                except ReviewItem.DoesNotExist:
                    print('ReviewItem does not exist', form_data)
        else:
            print('Hmm okay', form)
    else:
        form = ReviewForm()
    return render(request, 'review/add_review.html', {'form': form})

def search_review_item(request, category, search_term):
    if not request.user.is_authenticated:
        return JsonResponse(str(INVALID_USER_RESPONSE))
    if category not in CATEGORIES:
        return JsonResponse(str(INVALID_CATEGORY_RESPONSE))
    util_funcs = CATEGORIES[category]
    json_data = util_funcs['search'](search_term)
    if json_data["Response"] == "False":
        print('Error fetching search data from API ', json_data)
        return JsonResponse(json_data)
    item_data = util_funcs['convert'](json_data)
    return JsonResponse(item_data)

def get_review_item_info(request, category, item_id):
    if not request.user.is_authenticated:
        return JsonResponse(str(INVALID_USER_RESPONSE))
    if category not in CATEGORIES:
        return JsonResponse(str(INVALID_CATEGORY_RESPONSE))
    try:
        review_item = ReviewItem.objects.get(item_id=item_id)
        print('Got item from db {} {}'.format(category, item_id))
        return JsonResponse(review_item.to_review_json())
    except ReviewItem.DoesNotExist:
        print('Didn\'t find review item {} {} in db, fetching from API'.format(category, item_id))
    util_funcs = CATEGORIES[category]
    json_data = util_funcs['info'](item_id)
    if json_data["Response"] == "False":
        print('Error fetching info data from API ', json_data)
        return JsonResponse(json_data)
    item_data = util_funcs['convert'](json_data)
    item_data["Category"] = category
    if item_data["Response"] == "True":
        review_item = ReviewItem.from_review_json(**item_data)
        review_item.save()
        print('Saved item to db', category, item_id)
    return JsonResponse(item_data)

@login_required
def profile_redirect(request):
    return redirect('review:profile', username=request.user.username)

def view_profile(request, username):
    return HttpResponse('Building up')
