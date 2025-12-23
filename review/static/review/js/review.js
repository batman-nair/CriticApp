const baseUrl = window.location.origin;

async function getSearchItems(category, query) {
    const searchUrl = `${baseUrl}/search_item/${category}/${query}`;
    const response = await fetch(searchUrl);
    const data = await response.json();
    console.log('Got data from search', query, data);
    if (data["response"] == "False") {
        console.log("Got error from search ", query, data["error"]);
        return [];
    }
    return data["results"];
}

async function getReviewData(itemID) {
    const fetchUrl = `${baseUrl}/api/reviews/get_user_review/${itemID}`;
    const response = await fetch(fetchUrl);
    console.log('got reponse ', itemID, response);
    if (response.ok) {
        const data = await response.json();
        console.log('Got previous review data ', response, itemID, data);
        return data;
    }
    return null;
}

async function updateForm(category, itemID) {
    document.querySelector("#id_review_item").value = itemID;
    document.querySelector("#id_category").value = category;
    data = await getReviewData(itemID);
    if (data != null) {
        document.querySelector("#id_id").value = data["id"];
        document.querySelector("#id_review_data").value = data["review_data"];
        document.querySelector("#id_review_rating").value = data["review_rating"];
        document.querySelector("#id_review_tags").value = data["review_tags"];
        document.querySelector("#post-review-button").innerText = "Update Review";
    }
    else {
        document.querySelector("#id_id").value = "";
        document.querySelector("#id_review_data").value = "";
        document.querySelector("#id_review_rating").value = "";
        document.querySelector("#id_review_tags").value = "";
        document.querySelector("#post-review-button").innerText = "Add Review";
    }
    document.querySelector("#review-form").removeAttribute("disabled");
}

function populateReviewItemData(category, itemID) {
    updateReviewItem(category, itemID, reviewCard);
    updateForm(category, itemID);
}

async function validateAndPopulateReviewItemData(category, itemID) {
    data = await getReviewData(itemID);
    console.log('testing data ', data, category, itemID)
    if (data["category"] != category) {
        return;
    }
    populateReviewItemData(category, itemID);
}

async function getReviewItem(category, itemID) {
    const response = await fetch(`${baseUrl}/get_item_info/${category}/${itemID}`);
    const data = await response.json();
    console.log('Got review details: ', data);
    return data;
}

async function updateReviewItem(category, itemID, reviewCard) {
    const data = await getReviewItem(category, itemID);
    console.log('Got review item data: ', data);
    let titleDOM = reviewCard.querySelector(".review-title");
    let yearDOM = reviewCard.querySelector(".review-year");
    let imageDOM = reviewCard.querySelector("img");
    titleDOM.innerText = data["title"];
    titleDOM.textContent = data["title"] + " ";
    titleDOM.appendChild(yearDOM);

    if (data["image_url"] != "N/A") {
        imageDOM.src = data["image_url"];
    } else {
        imageDOM.src = "";
    }
    yearDOM.innerText = data["year"];
    reviewCard.querySelector(".review-attr1").innerText = data["attr1"];
    console.log(reviewCard.querySelector("img").height, reviewCard.querySelector("img").width);
    let descriptionDOM = reviewCard.querySelector(".review-description");
    let descriptionDOMBelow = reviewCard.querySelector(".review-description-below");
    console.log('Details', imageDOM.width, imageDOM.height, data["description"].length);
    if (imageDOM.width > imageDOM.height || data["description"].length > 300) {
        descriptionDOM.innerText = "";
        descriptionDOM = descriptionDOMBelow;
        descriptionDOMBelow.removeAttribute("hidden");
    } else {
        descriptionDOMBelow.innerText = "";
        descriptionDOMBelow.setAttribute("hidden", "");
    }
    descriptionDOM.innerText = data["description"];
    reviewCard.querySelector(".review-attr2").innerText = data["attr2"];
    reviewCard.querySelector(".review-rating").innerText = data["rating"];
    reviewCard.removeAttribute("hidden");
}

async function getReviews(query = '', username = '', filter_categories = [], ordering = '') {
    const reviewUrl = new URL(`${baseUrl}/api/reviews`);
    if (query) {
        reviewUrl.searchParams.append('query', query);
    }
    if (username) {
        reviewUrl.searchParams.append('username', username);
    }
    for (category of filter_categories) {
        reviewUrl.searchParams.append('filter_categories', category);
    }
    if (ordering) {
        reviewUrl.searchParams.append('ordering', ordering);
    }
    const response = await fetch(reviewUrl);
    const data = await response.json();
    console.log('Got reviews', data);
    return [...data];
}

// Helper to safely create an element with text
function createElement(tag, classes = [], text = null) {
    const el = document.createElement(tag);
    if (classes.length) el.classList.add(...classes);
    if (text) el.innerText = text;
    return el;
}

function buildReviewGridItem(review) {
    // Structure:
    // <div class="card review-card review-card-expandable" ...>
    //   <img ...>
    //   <div class="card-body">
    //     <h5 class="review-title ...">title</h5>
    //     ...
    //   </div>
    //   ... hidden spans ...
    // </div>

    // Create Main Card
    const card = createElement('div', ['card', 'review-card', 'review-card-expandable']);
    card.setAttribute('data-bs-toggle', 'modal');
    card.setAttribute('data-bs-target', '#review-detail-modal');

    // Image
    const img = createElement('img', ['card-img-top']);
    img.src = review.review_item.image_url;
    img.alt = "Poster Image";
    card.appendChild(img);

    // Card Body
    const body = createElement('div', ['card-body']);

    const title = createElement('h5', ['review-title', 'card-title'], review.review_item.title);
    body.appendChild(title);

    const pAttr1 = createElement('p', ['card-text']);
    const smallAttr1 = createElement('small', ['attr1', 'text-muted'], review.review_item.attr1);
    pAttr1.appendChild(smallAttr1);
    body.appendChild(pAttr1);

    const pData = createElement('p', ['review-data', 'card-text'], review.review_data);
    body.appendChild(pData);

    const pRating = createElement('p', ['review-rating', 'card-text'], review.review_rating + "⭐");
    body.appendChild(pRating);

    card.appendChild(body);

    // Hidden Spans
    const hiddenFields = [
        { cls: 'review-id', val: review.id },
        { cls: 'review-user', val: review.user },
        { cls: 'item-id', val: review.review_item.item_id },
        { cls: 'category', val: review.review_item.category },
        { cls: 'year', val: review.review_item.year },
        { cls: 'description', val: review.review_item.description, isDiv: true },
        { cls: 'attr2', val: review.review_item.attr2 },
        { cls: 'attr3', val: review.review_item.attr3 },
        { cls: 'review-tags', val: review.review_tags },
    ];

    hiddenFields.forEach(field => {
        const el = createElement(field.isDiv ? 'div' : 'span', [field.cls], field.val);
        el.setAttribute('hidden', '');
        card.appendChild(el);
    });

    return card;
}

function buildReviewCardObject(review) {
    const reviewCardWrapper = document.createElement("div");
    reviewCardWrapper.classList.add('mb-4');
    reviewCardWrapper.setAttribute('data-review-id', review.id);
    if (review.review_item.category == 'game') {
        reviewCardWrapper.classList.add('col-6', 'col-lg-6');
    }
    else {
        reviewCardWrapper.classList.add('col-6', 'col-lg-3');
    }
    const content = buildReviewGridItem(review);
    reviewCardWrapper.appendChild(content);

    return reviewCardWrapper;
}

function getReviewDataFromCard(reviewObject) {
    const review = {
        title: reviewObject.querySelector(".review-title").innerText,
        image_url: reviewObject.querySelector("img").src,
        description: reviewObject.querySelector(".description").innerText,
        year: reviewObject.querySelector(".year").innerText,
        attr1: reviewObject.querySelector(".attr1").innerText,
        attr2: reviewObject.querySelector(".attr2").innerText,
        attr3: reviewObject.querySelector(".attr3").innerText,
        item_id: reviewObject.querySelector(".item-id").innerText,
        category: reviewObject.querySelector(".category").innerText,
        review_tags: reviewObject.querySelector(".review-tags").innerText,
        review_data: reviewObject.querySelector(".review-data").innerText,
        review_rating: reviewObject.querySelector(".review-rating").innerText,
        id: reviewObject.querySelector(".review-id").innerText,
        user: reviewObject.querySelector(".review-user").innerText,
    };
    return review;
}
function populateModalFromReviewData(modalObj, reviewData) {
    modalObj.querySelector(".review-title").innerText = reviewData.title;
    modalObj.querySelector(".year").innerText = reviewData.year;
    modalObj.querySelector("img").src = reviewData.image_url;
    modalObj.querySelector(".attr1").innerText = reviewData.attr1;
    modalObj.querySelector(".attr2").innerText = reviewData.attr2;
    modalObj.querySelector(".attr3").innerText = reviewData.attr3;
    modalObj.querySelector(".review-data").innerText = reviewData.review_data;
    modalObj.querySelector(".review-rating").innerText = reviewData.review_rating;
    modalObj.querySelector(".description").innerText = reviewData.description;
    modalObj.querySelector(".edit-button").setAttribute("onclick", `window.location.href='/add?item_id=${reviewData.item_id}&category=${reviewData.category}'`);
    // console.log("Setting onclick to " + `window.location.href='/add?item_id=${reviewData.item_id}&category=${reviewData.category}'`);
    modalObj.querySelector(".item-id").innerText = reviewData.item_id;
    modalObj.querySelector(".category").innerText = reviewData.category;
    modalObj.querySelector(".review-tags").innerText = reviewData.review_tags;
    modalObj.querySelector(".review-data").setAttribute("data-review-id", reviewData.id);

    // Toggle delete button visibility
    const deleteBtn = modalObj.querySelector(".delete-button");
    if (reviewData.user === currentUsername) {
        deleteBtn.removeAttribute("hidden");
    } else {
        deleteBtn.setAttribute("hidden", "");
    }
}



function reviewDetailModalListener(event) {
    const modalObj = event.target;
    const reviewCard = event.relatedTarget;
    const reviewData = getReviewDataFromCard(reviewCard);
    console.log(reviewData)
    populateModalFromReviewData(modalObj, reviewData);
}

function populateReviewCards(parentSelector, reviews) {
    const container = document.querySelector(parentSelector);
    container.innerHTML = "";
    for (var review of reviews) {
        const reviewCard = buildReviewCardObject(review);
        container.appendChild(reviewCard);
    }
}

// From freecodecamp
function debounce(func, timeout = 300) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => { func.apply(this, args); }, timeout);
    }
}
function deleteModalListener(event) {
    const deleteModal = document.querySelector("#delete-modal");
    deleteModal.querySelector(".review-title").innerText = reviewTitle.innerText;
    deleteModal.querySelector(".btn-danger").addEventListener('click', () => {
        const reviewId = reviewDetailModal.querySelector(".review-data").getAttribute("data-review-id");
        deleteReview(reviewId);
    });
}



function getCookie(name) {
    let cookieValue = null;
    if (document.cookie && document.cookie !== '') {
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim();
            if (cookie.substring(0, name.length + 1) === (name + '=')) {
                cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                break;
            }
        }
    }
    return cookieValue;
}

function deleteReview(reviewId) {
    const url = `/api/reviews/${reviewId}/`;

    // Try getting from cookie first, then DOM
    let csrfToken = getCookie('csrftoken');
    if (!csrfToken) {
        const input = document.querySelector('[name=csrfmiddlewaretoken]');
        if (input) csrfToken = input.value;
    }

    fetch(url, {
        method: 'DELETE',
        headers: {
            'X-CSRFToken': csrfToken
        }
    })
        .then(async response => {
            if (response.ok) {
                // Remove the element from the DOM
                const reviewCardWrapper = document.querySelector(`div[data-review-id="${reviewId}"]`);
                if (reviewCardWrapper) {
                    // Start masonry removal animation if available or just remove
                    masonry.remove(reviewCardWrapper);
                    masonry.layout();
                }

                // Close the modals
                const deleteModalEl = document.querySelector('#delete-modal');
                const deleteModal = bootstrap.Modal.getInstance(deleteModalEl);
                if (deleteModal) {
                    deleteModal.hide();
                }

                const detailModalEl = document.querySelector('#review-detail-modal');
                const detailModal = bootstrap.Modal.getInstance(detailModalEl);
                if (detailModal) {
                    detailModal.hide();
                }
            } else {
                // Retrieve error message if available
                // Note: 204 No Content won't have JSON, but response.ok covers it.
                // If not ok, there might be JSON.
                try {
                    const data = await response.json();
                    alert("Error deleting review: " + (data.detail || data.error || response.statusText));
                    console.error('Delete error:', data);
                } catch (e) {
                    alert("Error deleting review: " + response.statusText);
                }
            }
        })
        .catch(error => {
            console.error('Error:', error);
            alert("Network error occurred");
        });
}
