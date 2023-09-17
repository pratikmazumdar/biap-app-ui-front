import React, { Fragment, useContext, useEffect, useState } from "react";
import useStyles from "./style";
import { useParams, useHistory } from "react-router-dom";

import Grid from "@mui/material/Grid";
import Button from "@mui/material/Button";
import Fab from "@mui/material/Fab";
import Accordion from "@mui/material/Accordion";
import AccordionSummary from "@mui/material/AccordionSummary";
import AccordionDetails from "@mui/material/AccordionDetails";
import Typography from "@mui/material/Typography";
import AddIcon from "@mui/icons-material/Add";
import RemoveIcon from "@mui/icons-material/Remove";

import { ReactComponent as ExpandMoreIcon } from "../../../../assets/images/chevron-down.svg";
import MenuItem from "./menuItem";
import ModalComponent from "../../../common/Modal";
import Loading from "../../../shared/loading/loading";

import useCancellablePromise from "../../../../api/cancelRequest";
import { ReactComponent as MenuIcon } from "../../../../assets/images/menu.svg";
import { getCustomMenuItemsRequest } from "../../../../api/brand.api";

import CustomizationRenderer from "../../../application/product-list/product-details/CustomizationRenderer";
import { getValueFromCookie } from "../../../../utils/cookies";
import { getCall, postCall } from "../../../../api/axios";
import {
  formatCustomizationGroups,
  formatCustomizations,
  initializeCustomizationState,
} from "../../../application/product-list/product-details/utils";
import { CartContext } from "../../../../context/cartContext";
const MenuItems = ({ customMenu, updateItemsOfCustomMenuRef }) => {
  const classes = useStyles();
  const history = useHistory();
  const { brandId, outletId } = useParams();

  const [isLoading, setIsLoading] = useState(false);
  const [menuItems, setMenuItems] = useState([]);
  const [menuModal, setMenuModal] = useState(false);

  const [customizationModal, setCustomizationModal] = useState(false);
  const [productPayload, setProductPayload] = useState(null);
  const [customization_state, setCustomizationState] = useState({});
  const [productLoading, setProductLoading] = useState(false);
  const [itemQty, setItemQty] = useState(1);
  const { fetchCartItems } = useContext(CartContext);

  const [customizationPrices, setCustomizationPrices] = useState(0);

  // HOOKS
  const { cancellablePromise } = useCancellablePromise();

  useEffect(() => {
    if (customMenu && customMenu?.id) {
      getCustomMenuItems(customMenu.id);
    }
  }, [customMenu]);

  const getCustomMenuItems = async (menuId) => {
    setIsLoading(true);
    try {
      const data = await cancellablePromise(getCustomMenuItemsRequest(menuId));
      let resData = Object.assign([], JSON.parse(JSON.stringify(data.data)));
      resData = resData.map((item) => {
        const findVegNonVegTag = item.item_details.tags.find((tag) => tag.code === "veg_nonveg");
        if (findVegNonVegTag) {
          item.item_details.isVeg =
            findVegNonVegTag.list[0].value === "yes" || findVegNonVegTag.list[0].value === "Yes";
        } else {
        }
        return item;
      });
      updateItemsOfCustomMenuRef(menuId, resData);
      setMenuItems(resData);
    } catch (err) {
      return err;
    } finally {
      setIsLoading(false);
    }
  };

  const getProductDetails = async (productId) => {
    try {
      setProductLoading(true);
      const data = await cancellablePromise(getCall(`/clientApis/v2/items/${productId}`));
      setProductPayload(data.response);
      return data.response;
    } catch (error) {
      console.error("Error fetching product details:", error);
    } finally {
      setProductLoading(false);
    }
  };

  const calculateSubtotal = (groupId, customization_state) => {
    let group = customization_state[groupId];
    if (!group) return;

    let prices = group.selected.map((s) => s.price);
    setCustomizationPrices((prevState) => {
      return prevState + prices.reduce((a, b) => a + b, 0);
    });

    group?.childs?.map((child) => {
      calculateSubtotal(child, customization_state);
    });
  };

  let selectedCustomizationIds = [];
  const getCustomization_ = (groupId, customization_state) => {
    let group = customization_state[groupId];
    if (!group) return;

    let customizations = group.selected.map((s) => selectedCustomizationIds.push(s.id));
    group?.childs?.map((child) => {
      getCustomization_(child, customization_state);
    });
  };

  const getCustomizations = async (productPayload, customization_state) => {
    const { customisation_items } = productPayload;
    const customizations = [];
    const firstGroupId = customization_state["firstGroup"].id;

    console.log("selectedCustomizationIds", customization_state);
    getCustomization_(firstGroupId, customization_state);

    for (const cId of selectedCustomizationIds) {
      let c = customisation_items.find((item) => item.local_id === cId);
      if (c) {
        c = {
          ...c,
          quantity: {
            count: 1,
          },
        };
        customizations.push(c);
      }
    }
    return customizations;
  };

  const addToCart = async (productPayload, isDefault = false) => {
    console.log("productPayload", productPayload);
    setProductLoading(true);
    const user = JSON.parse(getValueFromCookie("user"));
    const url = `/clientApis/v2/cart/${user.id}`;
    const groups = await formatCustomizationGroups(productPayload.customisation_groups);
    const cus = await formatCustomizations(productPayload.customisation_items);
    const newState = await initializeCustomizationState(groups, cus, customization_state);
    const customizationState = isDefault ? newState : customization_state;
    const customisations = await getCustomizations(productPayload, customizationState);

    calculateSubtotal(customizationState["firstGroup"].id, customizationState);
    const subtotal = productPayload?.item_details?.price?.value + customizationPrices;

    const payload = {
      id: productPayload.id,
      local_id: productPayload.local_id,
      bpp_id: productPayload.bpp_details.bpp_id,
      bpp_uri: productPayload.context.bpp_uri,
      domain: productPayload.context.domain,
      tags: productPayload.item_details.tags,
      quantity: {
        count: itemQty,
      },
      provider: {
        id: productPayload.bpp_details.bpp_id,
        locations: productPayload.locations,
        ...productPayload.provider_details,
      },
      product: {
        id: productPayload.id,
        subtotal,
        ...productPayload.item_details,
      },
      customisations,
      hasCustomisations:
        productPayload.hasOwnProperty("customisation_groups") && productPayload.customisation_groups.length > 0,
    };

    console.log("payload", payload);

    postCall(url, payload)
      .then(() => {
        fetchCartItems();
        setCustomizationState({});
        setCustomizationModal(false);
        setProductLoading(false);
      })
      .catch((error) => {
        console.log(error);
        setProductLoading(false);
      });
  };

  useEffect(() => {
    if (customization_state && customization_state["firstGroup"]) {
      setCustomizationPrices(0);
      calculateSubtotal(customization_state["firstGroup"]?.id, customization_state);
    }
  }, [customization_state]);

  return (
    <Accordion defaultExpanded={true}>
      <AccordionSummary
        expandIcon={<ExpandMoreIcon className={classes.expandIcon} />}
        aria-controls="panel1a-content"
        id="panel1a-header"
      >
        <Typography variant="h5">{`${customMenu?.descriptor?.name} (${menuItems?.length || 0})`}</Typography>
      </AccordionSummary>
      <AccordionDetails>
        {isLoading ? (
          <div className={classes.loader}>
            <Loading />
          </div>
        ) : (
          <>
            {menuItems.length > 0 ? (
              <Grid container spacing={3}>
                {menuItems.map((item, itemInd) => (
                  <Grid item xs={12} sm={12} md={12} lg={12} xl={12} key={`menu-item-ind-${itemInd}`}>
                    <MenuItem
                      productPayload={item}
                      setProductPayload={setProductPayload}
                      product={item?.item_details}
                      productId={item.id}
                      price={item?.item_details?.price}
                      bpp_provider_descriptor={item?.provider_details?.descriptor}
                      bpp_id={item?.bpp_details?.bpp_id}
                      location_id={item?.location_details ? item.location_details?.id : ""}
                      bpp_provider_id={item?.provider_details?.id}
                      handleAddToCart={addToCart}
                      setCustomizationModal={setCustomizationModal}
                      getProductDetails={getProductDetails}
                      productLoading={productLoading}
                    />
                  </Grid>
                ))}
              </Grid>
            ) : (
              <Typography variant="body1">There is not items available in this menu</Typography>
            )}
          </>
        )}

        <ModalComponent
          open={customizationModal}
          onClose={() => {
            setCustomizationModal(false);
            setCustomizationState({});
            fetchCartItems();
          }}
          title="Customize"
        >
          {productLoading ? (
            <Loading />
          ) : (
            <>
              <CustomizationRenderer
                productPayload={productPayload}
                customization_state={customization_state}
                setCustomizationState={setCustomizationState}
              />
              <Grid container sx={{ marginTop: 4 }}>
                <Grid container alignItems="center" justifyContent="space-around" xs={3} className={classes.qty}>
                  <RemoveIcon
                    fontSize="small"
                    className={classes.qtyIcon}
                    onClick={() => {
                      if (itemQty > 1) setItemQty(itemQty - 1);
                    }}
                  />
                  <Typography variant="body1" color="#196AAB">
                    {itemQty}
                  </Typography>
                  <AddIcon fontSize="small" className={classes.qtyIcon} onClick={() => setItemQty(itemQty + 1)} />
                </Grid>
                <Button variant="contained" sx={{ flex: 1 }} onClick={() => addToCart(productPayload)}>
                  Add Item Total- ₹{(productPayload?.item_details?.price.value + customizationPrices) * itemQty}{" "}
                </Button>
              </Grid>
            </>
          )}
        </ModalComponent>
      </AccordionDetails>
    </Accordion>
  );
};

export default MenuItems;
