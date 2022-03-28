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

async function getReviews(query='', username='', filter_categories=[], ordering='') {
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
        <div class="card review-card" data-bs-toggle="modal" data-bs-target="#review-detail-modal">
            <img src="${review.review_item.image_url}" class="card-img-top" alt="Poster Image">
            <div class="card-body">
                <h5 class="review-title card-title">${review.review_item.title}</h5>
                <p class="card-text"><small class="attr1 text-muted">${review.review_item.attr1}</small></p>
                <p class="review-data card-text">${review.review_data}</p>
                <p class="review-rating card-text">${review.review_rating}⭐</p>
            </div>
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
        review_tags: reviewObject.querySelector(".review-tags").innerText,
        review_data: reviewObject.querySelector(".review-data").innerText,
        review_rating: reviewObject.querySelector(".review-rating").innerText,
    };
    return review;
}
function populateModalFromReviewData(modalObj, reviewData) {
    const yearObj = modalObj.querySelector(".review-year");
    yearObj.innerHTML = reviewData.year;
    modalObj.querySelector(".review-title").innerHTML = reviewData.title + " " + yearObj.outerHTML;
    modalObj.querySelector("img").src = reviewData.image_url;
    modalObj.querySelector(".attr1").innerHTML = reviewData.attr1;
    modalObj.querySelector(".attr2").innerHTML = reviewData.attr2;
    modalObj.querySelector(".attr3").innerHTML = reviewData.attr3;
    modalObj.querySelector(".review-data").innerHTML = reviewData.review_data;
    modalObj.querySelector(".review-rating").innerHTML = reviewData.review_rating;
    modalObj.querySelector(".description").innerHTML = reviewData.description;
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
function debounce(func, timeout=300) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => { func.apply(this, args); }, timeout);
    }
}