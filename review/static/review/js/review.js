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
    titleDOM.innerHTML = data["title"] + " " + yearDOM.outerHTML;
    if (data["image_url"] != "N/A") {
        imageDOM.src = data["image_url"];
    } else {
        imageDOM.src = "";
    }
    reviewCard.querySelector(".review-year").innerText = data["year"];
    reviewCard.querySelector(".review-attr1").innerText = data["attr1"];
    console.log(reviewCard.querySelector("img").height, reviewCard.querySelector("img").width);
    let descriptionDOM = reviewCard.querySelector(".review-description");
    let descriptionDOMBelow = reviewCard.querySelector(".review-description-below");
    console.log('Details', imageDOM.width, imageDOM.height, data["description"].length);
    if (imageDOM.width > imageDOM.height || data["description"].length > 300) {
        descriptionDOM.innerHTML = "";
        descriptionDOM = descriptionDOMBelow;
        descriptionDOMBelow.removeAttribute("hidden");
    } else {
        descriptionDOMBelow.innerHTML = "";
        descriptionDOMBelow.setAttribute("hidden", "");
    }
    descriptionDOM.innerHTML = data["description"];
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

function createReviewCardContent(review) {
    return `
        <div class="card review-card review-card-expandable" data-bs-toggle="modal" data-bs-target="#review-detail-modal">
            <img src="${review.review_item.image_url}" class="card-img-top" alt="Poster Image">
            <div class="card-body">
                <h5 class="review-title card-title">${review.review_item.title}</h5>
                <p class="card-text"><small class="attr1 text-muted">${review.review_item.attr1}</small></p>
                <p class="review-data card-text">${review.review_data}</p>
                <p class="review-rating card-text">${review.review_rating}⭐</p>
            </div>
            <span class="review-id" hidden>${review.id}</span>
            <span class="review-user" hidden>${review.user}</span>
            <span class="item-id" hidden>${review.review_item.item_id}</span>
            <span class="category" hidden>${review.review_item.category}</span>
            <span class="year" hidden>${review.review_item.year}</span>
            <div class="description" hidden>${review.review_item.description}</div>
            <span class="attr2" hidden>${review.review_item.attr2}</span>
            <span class="attr3" hidden>${review.review_item.attr3}</span>
            <span class="review-tags" hidden>${review.review_tags}</span>
        </div>
    `;
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
    const content = createReviewCardContent(review);
    reviewCardWrapper.innerHTML = content;

    return reviewCardWrapper;
}

function getReviewDataFromCard(reviewObject) {
    const review = {
        title: reviewObject.querySelector(".review-title").innerText,
        image_url: reviewObject.querySelector("img").src,
        description: reviewObject.querySelector(".description").innerHTML,
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
    modalObj.querySelector(".review-title").innerHTML = reviewData.title;
    modalObj.querySelector(".year").innerHTML = reviewData.year;
    modalObj.querySelector("img").src = reviewData.image_url;
    modalObj.querySelector(".attr1").innerHTML = reviewData.attr1;
    modalObj.querySelector(".attr2").innerHTML = reviewData.attr2;
    modalObj.querySelector(".attr3").innerHTML = reviewData.attr3;
    modalObj.querySelector(".review-data").innerHTML = reviewData.review_data;
    modalObj.querySelector(".review-rating").innerHTML = reviewData.review_rating;
    modalObj.querySelector(".description").innerHTML = reviewData.description;
    modalObj.querySelector(".edit-button").setAttribute("onclick", `window.location.href='/add?item_id=${reviewData.item_id}&category=${reviewData.category}'`);
    // console.log("Setting onclick to " + `window.location.href='/add?item_id=${reviewData.item_id}&category=${reviewData.category}'`);
    modalObj.querySelector(".item-id").innerHTML = reviewData.item_id;
    modalObj.querySelector(".category").innerHTML = reviewData.category;
    modalObj.querySelector(".review-tags").innerHTML = reviewData.review_tags;
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
